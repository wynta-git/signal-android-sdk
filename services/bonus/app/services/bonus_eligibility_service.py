from __future__ import annotations

import aiomysql
import structlog

from shared.clients.mysql import get_connection

from app.exceptions import (
    BonusEligibilityKeyNotFoundError,
    BonusEligibilityNotFoundError,
    BonusEligibilityValidationError,
    DatabaseError,
)
from app.models.bonus_eligibility import (
    BonusEligibilityCreate,
    BonusEligibilityResponse,
    BonusEligibilityUpdate,
    EligibilityKeyCreate,
    EligibilityKeyResponse,
    EligibilityKeyUpdate,
)
from app.services.bonus_head_service import (
    _as_dt,
    _compute_row_hash,
    _write_change_log,
)

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# SQL — bonus_eligibility
# ---------------------------------------------------------------------------

_INSERT_ELIGIBILITY_SQL = """
    INSERT INTO bonus_eligibility
        (configure_id, site_id, description, active, created_by, updated_by, row_hash)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_ELIGIBILITY_SQL = """
    SELECT id, configure_id, site_id, description, active,
           created_by, updated_by, created_at, updated_at
    FROM bonus_eligibility
    WHERE id = %s
"""

_UPDATE_ELIGIBILITY_SQL = """
    UPDATE bonus_eligibility
    SET {set_clause}
    WHERE id = %s
"""

# ---------------------------------------------------------------------------
# SQL — bonus_eligibility_key
# ---------------------------------------------------------------------------

_INSERT_KEY_SQL = """
    INSERT INTO bonus_eligibility_key
        (eligibility_id, eligibility_key, eligibility_value, eligibility_value_type)
    VALUES (%s, %s, %s, %s)
"""

_SELECT_KEYS_SQL = """
    SELECT id, eligibility_id, eligibility_key, eligibility_value,
           eligibility_value_type, created_at, updated_at
    FROM bonus_eligibility_key
    WHERE eligibility_id = %s
    ORDER BY id
"""

_SELECT_KEY_SQL = """
    SELECT id, eligibility_id, eligibility_key, eligibility_value,
           eligibility_value_type, created_at, updated_at
    FROM bonus_eligibility_key
    WHERE id = %s
"""

_UPDATE_KEY_SQL = "UPDATE bonus_eligibility_key SET {set_clause} WHERE id = %s"

_DELETE_KEY_SQL = "DELETE FROM bonus_eligibility_key WHERE id = %s"

_KEY_ELIGIBILITY_ID_SQL = "SELECT eligibility_id FROM bonus_eligibility_key WHERE id = %s"

# ---------------------------------------------------------------------------
# Row mappers
# ---------------------------------------------------------------------------


def _row_to_eligibility(row: tuple, keys: list[EligibilityKeyResponse]) -> BonusEligibilityResponse:
    # id[0] configure_id[1] site_id[2] description[3] active[4]
    # created_by[5] updated_by[6] created_at[7] updated_at[8]
    return BonusEligibilityResponse(
        id=row[0],
        configure_id=row[1],
        site_id=row[2],
        description=row[3],
        active=bool(row[4]),
        created_by=row[5],
        updated_by=row[6],
        created_at=_as_dt(row[7]),
        updated_at=_as_dt(row[8]),
        keys=keys,
    )


def _row_to_key(row: tuple) -> EligibilityKeyResponse:
    # id[0] eligibility_id[1] eligibility_key[2] eligibility_value[3]
    # eligibility_value_type[4] created_at[5] updated_at[6]
    return EligibilityKeyResponse(
        id=row[0],
        eligibility_id=row[1],
        eligibility_key=row[2],
        eligibility_value=row[3],
        eligibility_value_type=row[4],
        created_at=_as_dt(row[5]),
        updated_at=_as_dt(row[6]),
    )


async def _load_keys(cur: aiomysql.Cursor, eligibility_id: int) -> list[EligibilityKeyResponse]:  # type: ignore[type-arg]
    await cur.execute(_SELECT_KEYS_SQL, (eligibility_id,))
    return [_row_to_key(r) for r in await cur.fetchall()]


def _eligibility_hash(data: dict) -> str:
    return _compute_row_hash({
        "configure_id": data["configure_id"],
        "site_id":      data["site_id"],
        "description":  data["description"],
        "active":       int(data["active"]),
        "created_by":   data["created_by"],
        "updated_by":   data["updated_by"],
    })


# ---------------------------------------------------------------------------
# Service — bonus_eligibility CRUD
# ---------------------------------------------------------------------------


async def add_bonus_eligibility(data: BonusEligibilityCreate) -> BonusEligibilityResponse:
    """
    Create a bonus_eligibility header row and optionally insert key children.

    All writes happen in a single transaction.
    """
    if data.created_by.isdigit():
        raise BonusEligibilityValidationError(
            "created_by", "created_by must be a username or email, not a numeric id"
        )

    log.info("add_bonus_eligibility.start", configure_id=data.configure_id)

    row_hash = _eligibility_hash({
        "configure_id": data.configure_id,
        "site_id":      data.site_id,
        "description":  data.description,
        "active":       data.active,
        "created_by":   data.created_by,
        "updated_by":   data.created_by,
    })

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    _INSERT_ELIGIBILITY_SQL,
                    (
                        data.configure_id,
                        data.site_id,
                        data.description,
                        int(data.active),
                        data.created_by,
                        data.created_by,
                        row_hash,
                    ),
                )
                eligibility_id: int = cur.lastrowid  # type: ignore[assignment]

                await _write_change_log(
                    cur,
                    cl_table="bonus_eligibility_change_log",
                    entity_id=eligibility_id,
                    site_id=data.site_id,
                    action="INSERT",
                    changed_by=data.created_by,
                    new_values={
                        "configure_id": data.configure_id,
                        "site_id":      data.site_id,
                        "description":  data.description,
                        "active":       int(data.active),
                        "created_by":   data.created_by,
                    },
                )

                for key in data.keys:
                    await cur.execute(
                        _INSERT_KEY_SQL,
                        (
                            eligibility_id,
                            key.eligibility_key,
                            key.eligibility_value,
                            key.eligibility_value_type,
                        ),
                    )
                    key_id: int = cur.lastrowid  # type: ignore[assignment]
                    await _write_change_log(
                        cur,
                        cl_table="bonus_eligibility_key_change_log",
                        entity_id=key_id,
                        site_id=data.site_id,
                        action="INSERT",
                        changed_by=data.created_by,
                        new_values={
                            "eligibility_id":        eligibility_id,
                            "eligibility_key":        key.eligibility_key,
                            "eligibility_value":      key.eligibility_value,
                            "eligibility_value_type": key.eligibility_value_type,
                        },
                    )

                await conn.commit()

                await cur.execute(_SELECT_ELIGIBILITY_SQL, (eligibility_id,))
                row = await cur.fetchone()
                keys = await _load_keys(cur, eligibility_id)

    except BonusEligibilityValidationError:
        raise
    except Exception as exc:
        log.error("add_bonus_eligibility.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert row is not None
    response = _row_to_eligibility(row, keys)
    log.info("add_bonus_eligibility.created", eligibility_id=response.id)
    return response


async def get_bonus_eligibility(eligibility_id: int) -> BonusEligibilityResponse:
    """Return a single bonus_eligibility row with embedded keys."""
    log.info("get_bonus_eligibility.start", eligibility_id=eligibility_id)
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_ELIGIBILITY_SQL, (eligibility_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusEligibilityNotFoundError(eligibility_id)
                keys = await _load_keys(cur, eligibility_id)
    except BonusEligibilityNotFoundError:
        raise
    except Exception as exc:
        log.error("get_bonus_eligibility.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc
    return _row_to_eligibility(row, keys)


async def update_bonus_eligibility(
    eligibility_id: int, data: BonusEligibilityUpdate
) -> BonusEligibilityResponse:
    """Partial update of bonus_eligibility header fields."""
    updates: dict[str, object] = {}
    if "description" in data.model_fields_set:
        updates["description"] = data.description
    if "active" in data.model_fields_set and data.active is not None:
        updates["active"] = int(data.active)
    updates["updated_by"] = data.updated_by

    log.info("update_bonus_eligibility.start", eligibility_id=eligibility_id, fields=list(updates))

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_ELIGIBILITY_SQL, (eligibility_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusEligibilityNotFoundError(eligibility_id)

                site_id: int = row[2]
                old_values = {
                    "description": row[3],
                    "active":      int(row[4]),
                    "updated_by":  row[6],
                }

                new_hash_fields = {
                    "configure_id": row[1],
                    "site_id":      site_id,
                    "description":  updates.get("description", row[3]),
                    "active":       updates.get("active", int(row[4])),
                    "created_by":   row[5],
                    "updated_by":   data.updated_by,
                }
                updates["row_hash"] = _eligibility_hash(new_hash_fields)

                set_clause = ", ".join(f"`{col}` = %s" for col in updates)
                params: list[object] = list(updates.values()) + [eligibility_id]
                await cur.execute(
                    _UPDATE_ELIGIBILITY_SQL.format(set_clause=set_clause), params
                )

                await _write_change_log(
                    cur,
                    cl_table="bonus_eligibility_change_log",
                    entity_id=eligibility_id,
                    site_id=site_id,
                    action="UPDATE",
                    changed_by=data.updated_by,
                    old_values=old_values,
                    new_values={k: v for k, v in new_hash_fields.items() if k not in ("configure_id", "site_id", "created_by")},
                )

                await conn.commit()

                await cur.execute(_SELECT_ELIGIBILITY_SQL, (eligibility_id,))
                updated_row = await cur.fetchone()
                keys = await _load_keys(cur, eligibility_id)

    except BonusEligibilityNotFoundError:
        raise
    except Exception as exc:
        log.error("update_bonus_eligibility.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert updated_row is not None
    log.info("update_bonus_eligibility.done", eligibility_id=eligibility_id)
    return _row_to_eligibility(updated_row, keys)


# ---------------------------------------------------------------------------
# Service — bonus_eligibility_key CRUD
# ---------------------------------------------------------------------------


async def add_eligibility_key(
    eligibility_id: int, data: EligibilityKeyCreate
) -> EligibilityKeyResponse:
    """Add one key-value criterion to an existing eligibility rule set."""
    log.info("add_eligibility_key.start", eligibility_id=eligibility_id)

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_ELIGIBILITY_SQL, (eligibility_id,))
                parent = await cur.fetchone()
                if parent is None:
                    raise BonusEligibilityNotFoundError(eligibility_id)
                site_id: int = parent[2]
                created_by: str = parent[5]

                await cur.execute(
                    _INSERT_KEY_SQL,
                    (
                        eligibility_id,
                        data.eligibility_key,
                        data.eligibility_value,
                        data.eligibility_value_type,
                    ),
                )
                key_id: int = cur.lastrowid  # type: ignore[assignment]

                await _write_change_log(
                    cur,
                    cl_table="bonus_eligibility_key_change_log",
                    entity_id=key_id,
                    site_id=site_id,
                    action="INSERT",
                    changed_by=created_by,
                    new_values={
                        "eligibility_id":        eligibility_id,
                        "eligibility_key":        data.eligibility_key,
                        "eligibility_value":      data.eligibility_value,
                        "eligibility_value_type": data.eligibility_value_type,
                    },
                )
                await conn.commit()

                await cur.execute(_SELECT_KEY_SQL, (key_id,))
                row = await cur.fetchone()

    except BonusEligibilityNotFoundError:
        raise
    except Exception as exc:
        log.error("add_eligibility_key.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert row is not None
    return _row_to_key(row)


async def update_eligibility_key(
    key_id: int, data: EligibilityKeyUpdate, updated_by: str
) -> EligibilityKeyResponse:
    """Partial update of a bonus_eligibility_key row."""
    updates: dict[str, object] = {}
    if "eligibility_key" in data.model_fields_set and data.eligibility_key is not None:
        updates["eligibility_key"] = data.eligibility_key
    if "eligibility_value" in data.model_fields_set and data.eligibility_value is not None:
        updates["eligibility_value"] = data.eligibility_value
    if "eligibility_value_type" in data.model_fields_set and data.eligibility_value_type is not None:
        updates["eligibility_value_type"] = data.eligibility_value_type

    if not updates:
        # Nothing to patch — return current state
        return await _get_key_or_raise(key_id)

    log.info("update_eligibility_key.start", key_id=key_id)

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_KEY_SQL, (key_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusEligibilityKeyNotFoundError(key_id)

                eligibility_id: int = row[1]
                await cur.execute(_SELECT_ELIGIBILITY_SQL, (eligibility_id,))
                parent = await cur.fetchone()
                site_id: int = parent[2] if parent else 0  # type: ignore[index]

                old_values = {
                    "eligibility_key":        row[2],
                    "eligibility_value":      row[3],
                    "eligibility_value_type": row[4],
                }

                set_clause = ", ".join(f"`{col}` = %s" for col in updates)
                params: list[object] = list(updates.values()) + [key_id]
                await cur.execute(_UPDATE_KEY_SQL.format(set_clause=set_clause), params)

                await _write_change_log(
                    cur,
                    cl_table="bonus_eligibility_key_change_log",
                    entity_id=key_id,
                    site_id=site_id,
                    action="UPDATE",
                    changed_by=updated_by,
                    old_values=old_values,
                    new_values={**old_values, **updates},
                )
                await conn.commit()

                await cur.execute(_SELECT_KEY_SQL, (key_id,))
                updated_row = await cur.fetchone()

    except BonusEligibilityKeyNotFoundError:
        raise
    except Exception as exc:
        log.error("update_eligibility_key.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert updated_row is not None
    return _row_to_key(updated_row)


async def delete_eligibility_key(key_id: int, deleted_by: str) -> None:
    """Remove a key criterion from an eligibility rule set."""
    log.info("delete_eligibility_key.start", key_id=key_id)

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_KEY_SQL, (key_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusEligibilityKeyNotFoundError(key_id)

                eligibility_id: int = row[1]
                await cur.execute(_SELECT_ELIGIBILITY_SQL, (eligibility_id,))
                parent = await cur.fetchone()
                site_id: int = parent[2] if parent else 0  # type: ignore[index]

                old_values = {
                    "eligibility_id":        row[1],
                    "eligibility_key":        row[2],
                    "eligibility_value":      row[3],
                    "eligibility_value_type": row[4],
                }

                await cur.execute(_DELETE_KEY_SQL, (key_id,))

                await _write_change_log(
                    cur,
                    cl_table="bonus_eligibility_key_change_log",
                    entity_id=key_id,
                    site_id=site_id,
                    action="DELETE",
                    changed_by=deleted_by,
                    old_values=old_values,
                )
                await conn.commit()

    except BonusEligibilityKeyNotFoundError:
        raise
    except Exception as exc:
        log.error("delete_eligibility_key.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    log.info("delete_eligibility_key.done", key_id=key_id)


async def _get_key_or_raise(key_id: int) -> EligibilityKeyResponse:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SELECT_KEY_SQL, (key_id,))
            row = await cur.fetchone()
            if row is None:
                raise BonusEligibilityKeyNotFoundError(key_id)
    return _row_to_key(row)
