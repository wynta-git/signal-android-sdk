from __future__ import annotations

import aiomysql
import structlog

from shared.clients.mysql import POOL_BONUS, get_connection

from app.exceptions import (
    BonusEligibilityDuplicateError,
    BonusEligibilityNotFoundError,
    BonusEligibilityValidationError,
    DatabaseError,
)
from app.models.bonus_eligibility import (
    BonusEligibilityCreate,
    BonusEligibilityResponse,
    BonusEligibilityUpdate,
)
from app.services.bonus_head_service import (
    _as_dt,
    _compute_row_hash,
)

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

_INSERT_SQL = """
    INSERT INTO bonus_eligibility
        (configure_id, site_id, eligibility_key, eligibility_value,
         eligibility_value_type, description, active, created_by, updated_by, row_hash)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, configure_id, site_id, eligibility_key, eligibility_value,
           eligibility_value_type, description, active,
           created_by, updated_by, created_at, updated_at
    FROM bonus_eligibility
    WHERE id = %s
"""

_UPDATE_SQL = "UPDATE bonus_eligibility SET {set_clause} WHERE id = %s"

# ---------------------------------------------------------------------------
# Patchable columns
# ---------------------------------------------------------------------------

_PATCHABLE = {
    "eligibility_key":        "eligibility_key",
    "eligibility_value":      "eligibility_value",
    "eligibility_value_type": "eligibility_value_type",
    "description":            "description",
    "active":                 "active",
}

# ---------------------------------------------------------------------------
# Row mapper
# ---------------------------------------------------------------------------


def _row_to_response(row: tuple) -> BonusEligibilityResponse:
    # id[0] configure_id[1] site_id[2] eligibility_key[3] eligibility_value[4]
    # eligibility_value_type[5] description[6] active[7]
    # created_by[8] updated_by[9] created_at[10] updated_at[11]
    return BonusEligibilityResponse(
        id=row[0],
        configure_id=row[1],
        site_id=row[2],
        eligibility_key=row[3],
        eligibility_value=row[4],
        eligibility_value_type=row[5],
        description=row[6],
        active=bool(row[7]),
        created_by=row[8],
        updated_by=row[9],
        created_at=_as_dt(row[10]),
        updated_at=_as_dt(row[11]),
    )


def _row_hash(fields: dict) -> str:
    return _compute_row_hash({
        "configure_id":           fields["configure_id"],
        "site_id":                fields["site_id"],
        "eligibility_key":        fields["eligibility_key"],
        "eligibility_value":      fields["eligibility_value"],
        "eligibility_value_type": fields["eligibility_value_type"],
        "active":                 int(fields["active"]),
        "created_by":             fields["created_by"],
        "updated_by":             fields["updated_by"],
    })


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


async def add_bonus_eligibility(data: BonusEligibilityCreate) -> BonusEligibilityResponse:
    """Create one eligibility criterion row for a configure node."""
    log.info("add_bonus_eligibility.start", configure_id=data.configure_id)

    hash_val = _row_hash({
        "configure_id":           data.configure_id,
        "site_id":                data.site_id,
        "eligibility_key":        data.eligibility_key,
        "eligibility_value":      data.eligibility_value,
        "eligibility_value_type": data.eligibility_value_type,
        "active":                 data.active,
        "created_by":             data.created_by,
        "updated_by":             data.created_by,
    })

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    _INSERT_SQL,
                    (
                        data.configure_id,
                        data.site_id,
                        data.eligibility_key,
                        data.eligibility_value,
                        data.eligibility_value_type,
                        data.description,
                        int(data.active),
                        data.created_by,
                        data.created_by,
                        hash_val,
                    ),
                )
                eligibility_id: int = cur.lastrowid  # type: ignore[assignment]

                await conn.commit()

                await cur.execute(_SELECT_SQL, (eligibility_id,))
                row = await cur.fetchone()

    except BonusEligibilityValidationError:
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusEligibilityDuplicateError(data.configure_id, data.eligibility_key) from exc
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("add_bonus_eligibility.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert row is not None
    response = _row_to_response(row)
    log.info("add_bonus_eligibility.created", eligibility_id=response.id)
    return response


async def get_bonus_eligibility(eligibility_id: int) -> BonusEligibilityResponse:
    """Return a single bonus_eligibility criterion row."""
    log.info("get_bonus_eligibility.start", eligibility_id=eligibility_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            await conn.commit()  # force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (eligibility_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusEligibilityNotFoundError(eligibility_id)
    except BonusEligibilityNotFoundError:
        raise
    except Exception as exc:
        log.error("get_bonus_eligibility.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc
    return _row_to_response(row)


async def update_bonus_eligibility(
    eligibility_id: int, data: BonusEligibilityUpdate
) -> BonusEligibilityResponse:
    """Partial update of a bonus_eligibility criterion row."""
    updates: dict[str, object] = {}
    for field in ("eligibility_key", "eligibility_value", "eligibility_value_type", "description"):
        if field in data.model_fields_set:
            updates[field] = getattr(data, field)
    if "active" in data.model_fields_set and data.active is not None:
        updates["active"] = int(data.active)
    updates["updated_by"] = data.updated_by

    log.info("update_bonus_eligibility.start", eligibility_id=eligibility_id, fields=list(updates))

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (eligibility_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusEligibilityNotFoundError(eligibility_id)

                site_id: int = row[2]

                new_hash_fields = {
                    "configure_id":           row[1],
                    "site_id":                site_id,
                    "eligibility_key":        updates.get("eligibility_key", row[3]),
                    "eligibility_value":      updates.get("eligibility_value", row[4]),
                    "eligibility_value_type": updates.get("eligibility_value_type", row[5]),
                    "active":                 updates.get("active", int(row[7])),
                    "created_by":             row[8],
                    "updated_by":             data.updated_by,
                }
                updates["row_hash"] = _row_hash(new_hash_fields)

                set_clause = ", ".join(f"`{col}` = %s" for col in updates)
                params: list[object] = list(updates.values()) + [eligibility_id]
                await cur.execute(_UPDATE_SQL.format(set_clause=set_clause), params)

                await conn.commit()

                await cur.execute(_SELECT_SQL, (eligibility_id,))
                updated_row = await cur.fetchone()

    except BonusEligibilityNotFoundError:
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            key = updates.get("eligibility_key", row[3])  # type: ignore[possibly-undefined]
            raise BonusEligibilityDuplicateError(row[1], key) from exc  # type: ignore[possibly-undefined]
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("update_bonus_eligibility.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert updated_row is not None
    log.info("update_bonus_eligibility.done", eligibility_id=eligibility_id)
    return _row_to_response(updated_row)
