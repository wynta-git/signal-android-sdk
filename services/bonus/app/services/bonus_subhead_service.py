import aiomysql
import structlog

from shared.clients.mysql import get_connection

from app.exceptions import (
    BonusSubheadDuplicateError,
    BonusSubheadNotFoundError,
    BonusSubheadValidationError,
    DatabaseError,
)
from app.models.bonus_head import BudgetPeriod, LimitsUpsertRequest, OwnerEntry, OwnersUpsertRequest
from app.models.bonus_subhead import BonusSubheadCreate, BonusSubheadDetail, BonusSubheadResponse, BonusSubheadUpdate
from app.services.bonus_head_service import (
    _as_dt,
    _compute_row_hash,
)

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# SQL — bonus_subhead
# ---------------------------------------------------------------------------

_INSERT_SQL = """
    INSERT INTO bonus_subhead
        (head_id, site_id, name, description, active, owner, created_by, updated_by, row_hash)
    VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, head_id, site_id, name, description, active, owner,
           created_by, updated_by, created_at, updated_at
    FROM bonus_subhead
    WHERE id = %s
"""

# Checks parent head exists and returns site_id.
_EXISTS_HEAD_SQL = "SELECT site_id FROM bonus_head WHERE id = %s"

# Unique-key existence check.
_EXISTS_SUBHEAD_SQL = (
    "SELECT 1 FROM bonus_subhead WHERE head_id = %s AND name = %s LIMIT 1"
)

# Returns head_id + site_id — used in owner/limit upserts to avoid a HEAD lookup.
_EXISTS_SUBHEAD_ID_SQL = "SELECT head_id, site_id FROM bonus_subhead WHERE id = %s"

# ---------------------------------------------------------------------------
# SQL — bonus_owners / bonus_budget_limit upserts (entity_type = 'SUBHEAD')
# ---------------------------------------------------------------------------

_UPSERT_OWNER_SQL = """
    INSERT INTO bonus_owners
        (entity_type, entity_id, site_id, username, role, active, created_by, updated_by, row_hash)
    VALUES
        ('SUBHEAD', %s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        role       = VALUES(role),
        active     = VALUES(active),
        updated_by = VALUES(updated_by),
        row_hash   = VALUES(row_hash)
"""

_UPSERT_LIMIT_SQL = """
    INSERT INTO bonus_budget_limit
        (entity_type, entity_id, site_id, period_type, budget_limit, created_by, updated_by, row_hash)
    VALUES
        ('SUBHEAD', %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        budget_limit = VALUES(budget_limit),
        updated_by   = VALUES(updated_by),
        row_hash     = VALUES(row_hash)
"""

# ---------------------------------------------------------------------------
# SQL — reads
# ---------------------------------------------------------------------------

_SELECT_OWNERS_SQL = """
    SELECT username, role, active
    FROM bonus_owners
    WHERE entity_type = 'SUBHEAD' AND entity_id = %s
    ORDER BY role
"""

_SELECT_BUDGET_SQL = """
    SELECT
        bl.period_type,
        bl.budget_limit,
        COALESCE(bu.budget_used, 0.00) AS budget_used,
        bu.reset_at
    FROM bonus_budget_limit bl
    LEFT JOIN bonus_budget_usage bu
        ON  bu.entity_type = bl.entity_type
        AND bu.entity_id   = bl.entity_id
        AND bu.period_type = bl.period_type
    WHERE bl.entity_type = 'SUBHEAD' AND bl.entity_id = %s
    ORDER BY CASE bl.period_type
        WHEN 'DAILY'   THEN 1
        WHEN 'WEEKLY'  THEN 2
        WHEN 'MONTHLY' THEN 3
    END
"""

_SELECT_LIMITS_PRE_SQL = """
    SELECT period_type, budget_limit
    FROM bonus_budget_limit
    WHERE entity_type = 'SUBHEAD' AND entity_id = %s
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _validate_business_rules(owner: str, actor: str, actor_field: str) -> None:
    if owner.isdigit():
        raise BonusSubheadValidationError("owner", "owner must be a username or email, not a numeric id")
    if actor.isdigit():
        raise BonusSubheadValidationError(actor_field, f"{actor_field} must be a username or email, not a numeric id")


def _row_to_response(row: tuple) -> BonusSubheadResponse:
    return BonusSubheadResponse(
        id=row[0],
        head_id=row[1],
        site_id=row[2],
        name=row[3],
        description=row[4],
        active=bool(row[5]),
        owner=row[6],
        created_by=row[7],
        updated_by=row[8],
        created_at=_as_dt(row[9]),
        updated_at=_as_dt(row[10]),
    )


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def add_bonus_subhead(data: BonusSubheadCreate) -> BonusSubheadResponse:
    """
    Validate and insert a new bonus_subhead row.

    Raises:
        BonusSubheadValidationError: on business-rule violations.
        BonusSubheadNotFoundError:   when parent head_id does not exist.
        BonusSubheadDuplicateError:  when (head_id, name) already exists.
        DatabaseError:               on unexpected DB failures.
    """
    _validate_business_rules(data.owner, data.created_by, "created_by")

    log.info("add_bonus_subhead.start", head_id=data.head_id, name=data.name)

    row_hash = _compute_row_hash({
        "head_id": data.head_id,
        "site_id": data.site_id,
        "name": data.name,
        "description": data.description,
        "active": int(data.active),
        "owner": data.owner,
        "created_by": data.created_by,
        "updated_by": data.created_by,
    })

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_EXISTS_HEAD_SQL, (data.head_id,))
                head_row = await cur.fetchone()
                if head_row is None:
                    raise BonusSubheadNotFoundError(data.head_id)

                await cur.execute(_EXISTS_SUBHEAD_SQL, (data.head_id, data.name))
                if await cur.fetchone():
                    raise BonusSubheadDuplicateError(data.head_id, data.name)

                await cur.execute(
                    _INSERT_SQL,
                    (
                        data.head_id,
                        data.site_id,
                        data.name,
                        data.description,
                        int(data.active),
                        data.owner,
                        data.created_by,
                        data.created_by,
                        row_hash,
                    ),
                )
                new_id: int = cur.lastrowid  # type: ignore[assignment]

                await conn.commit()

                await cur.execute(_SELECT_SQL, (new_id,))
                row = await cur.fetchone()

    except (BonusSubheadDuplicateError, BonusSubheadValidationError, BonusSubheadNotFoundError):
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusSubheadDuplicateError(data.head_id, data.name) from exc
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("add_bonus_subhead.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    if row is None:
        raise DatabaseError("Insert succeeded but row could not be retrieved")

    response = _row_to_response(row)
    log.info("add_bonus_subhead.created", bonus_subhead_id=response.id, head_id=response.head_id)
    return response


async def get_bonus_subhead(subhead_id: int) -> BonusSubheadDetail:
    """
    Return full bonus subhead detail: core fields, owners, and budget.

    Raises:
        BonusSubheadNotFoundError: when the subhead_id does not exist.
        DatabaseError:             on unexpected DB failures.
    """
    log.info("get_bonus_subhead.start", bonus_subhead_id=subhead_id)

    try:
        async with get_connection() as conn:
            await conn.commit()  # force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (subhead_id,))
                subhead_row = await cur.fetchone()
                if subhead_row is None:
                    raise BonusSubheadNotFoundError(subhead_id)

                await cur.execute(_SELECT_OWNERS_SQL, (subhead_id,))
                owner_rows = await cur.fetchall()

                await cur.execute(_SELECT_BUDGET_SQL, (subhead_id,))
                budget_rows = await cur.fetchall()

    except BonusSubheadNotFoundError:
        raise
    except Exception as exc:
        log.error("get_bonus_subhead.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    return BonusSubheadDetail(
        **_row_to_response(subhead_row).model_dump(),
        owners=[OwnerEntry(username=r[0], role=r[1], active=bool(r[2])) for r in owner_rows],
        budget=[BudgetPeriod(period_type=r[0], limit=r[1], used=r[2], reset_at=r[3]) for r in budget_rows],
    )


_PATCHABLE: dict[str, str] = {
    "name": "name",
    "description": "description",
    "active": "active",
    "owner": "owner",
}


async def update_bonus_subhead(subhead_id: int, data: BonusSubheadUpdate) -> BonusSubheadResponse:
    """
    Partial update of a bonus_subhead row.

    Raises:
        BonusSubheadValidationError: owner is a raw numeric id.
        BonusSubheadNotFoundError:   subhead_id does not exist.
        BonusSubheadDuplicateError:  new name conflicts within the same head.
        DatabaseError:               unexpected DB failure.
    """
    if data.owner is not None and data.owner.isdigit():
        raise BonusSubheadValidationError(
            "owner", "owner must be a username or email, not a numeric id"
        )

    updates: dict[str, object] = {}
    for field, col in _PATCHABLE.items():
        if field not in data.model_fields_set:
            continue
        val = getattr(data, field)
        updates[col] = int(val) if field == "active" and val is not None else val
    updates["updated_by"] = data.updated_by

    log.info("update_bonus_subhead.start", bonus_subhead_id=subhead_id, fields=list(updates))

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (subhead_id,))
                subhead_row = await cur.fetchone()
                if subhead_row is None:
                    raise BonusSubheadNotFoundError(subhead_id)

                head_id: int = subhead_row[1]
                site_id: int = subhead_row[2]

                new_values_cl: dict = {
                    "head_id": head_id,
                    "site_id": site_id,
                    "name": updates.get("name", subhead_row[3]),
                    "description": updates.get("description", subhead_row[4]),
                    "active": updates.get("active", int(subhead_row[5])),
                    "owner": updates.get("owner", subhead_row[6]),
                    "created_by": subhead_row[7],
                    "updated_by": data.updated_by,
                }
                row_hash = _compute_row_hash(new_values_cl)
                updates["row_hash"] = row_hash

                set_clause = ", ".join(f"`{col}` = %s" for col in updates)
                params: list[object] = list(updates.values()) + [subhead_id]

                await cur.execute(
                    f"UPDATE bonus_subhead SET {set_clause} WHERE id = %s", params
                )
                await conn.commit()

                await cur.execute(_SELECT_SQL, (subhead_id,))
                updated_row = await cur.fetchone()

    except (BonusSubheadNotFoundError, BonusSubheadValidationError):
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusSubheadDuplicateError(head_id, data.name) from exc  # type: ignore[arg-type]
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("update_bonus_subhead.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert updated_row is not None
    log.info("update_bonus_subhead.done", bonus_subhead_id=subhead_id)
    return _row_to_response(updated_row)


async def upsert_owners(subhead_id: int, data: OwnersUpsertRequest) -> list[OwnerEntry]:
    """
    Add or update owner assignments for a bonus subhead.

    Raises:
        BonusSubheadNotFoundError: subhead_id does not exist.
        DatabaseError:             unexpected DB failure.
    """
    log.info("upsert_subhead_owners.start", bonus_subhead_id=subhead_id, count=len(data.owners))

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_EXISTS_SUBHEAD_ID_SQL, (subhead_id,))
                meta = await cur.fetchone()
                if meta is None:
                    raise BonusSubheadNotFoundError(subhead_id)
                head_id, site_id = meta[0], meta[1]

                for entry in data.owners:
                    row_hash = _compute_row_hash({
                        "entity_type": "SUBHEAD",
                        "entity_id": subhead_id,
                        "site_id": site_id,
                        "username": entry.username,
                        "role": entry.role,
                        "active": int(entry.active),
                        "updated_by": data.updated_by,
                    })
                    await cur.execute(
                        _UPSERT_OWNER_SQL,
                        (
                            subhead_id,
                            site_id,
                            entry.username,
                            entry.role,
                            int(entry.active),
                            data.updated_by,
                            data.updated_by,
                            row_hash,
                        ),
                    )

                await conn.commit()

                await cur.execute(_SELECT_OWNERS_SQL, (subhead_id,))
                owner_rows = await cur.fetchall()

    except BonusSubheadNotFoundError:
        raise
    except Exception as exc:
        log.error("upsert_subhead_owners.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    log.info("upsert_subhead_owners.done", bonus_subhead_id=subhead_id)
    return [OwnerEntry(username=r[0], role=r[1], active=bool(r[2])) for r in owner_rows]


async def upsert_limits(subhead_id: int, data: LimitsUpsertRequest) -> list[BudgetPeriod]:
    """
    Set or update budget caps for a bonus subhead.

    Raises:
        BonusSubheadNotFoundError: subhead_id does not exist.
        DatabaseError:             unexpected DB failure.
    """
    log.info("upsert_subhead_limits.start", bonus_subhead_id=subhead_id, count=len(data.limits))

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_EXISTS_SUBHEAD_ID_SQL, (subhead_id,))
                meta = await cur.fetchone()
                if meta is None:
                    raise BonusSubheadNotFoundError(subhead_id)
                head_id, site_id = meta[0], meta[1]

                for entry in data.limits:
                    row_hash = _compute_row_hash({
                        "entity_type": "SUBHEAD",
                        "entity_id": subhead_id,
                        "site_id": site_id,
                        "period_type": entry.period_type,
                        "budget_limit": str(entry.budget_limit),
                        "updated_by": data.updated_by,
                    })
                    await cur.execute(
                        _UPSERT_LIMIT_SQL,
                        (
                            subhead_id,
                            site_id,
                            entry.period_type,
                            entry.budget_limit,
                            data.updated_by,
                            data.updated_by,
                            row_hash,
                        ),
                    )

                await conn.commit()

                await cur.execute(_SELECT_BUDGET_SQL, (subhead_id,))
                budget_rows = await cur.fetchall()

    except BonusSubheadNotFoundError:
        raise
    except Exception as exc:
        log.error("upsert_subhead_limits.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    log.info("upsert_subhead_limits.done", bonus_subhead_id=subhead_id)
    return [
        BudgetPeriod(period_type=r[0], limit=r[1], used=r[2], reset_at=r[3])
        for r in budget_rows
    ]
