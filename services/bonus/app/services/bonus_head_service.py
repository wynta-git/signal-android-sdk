import hashlib
import json
from datetime import datetime

import aiomysql
import structlog

from shared.clients.mysql import get_connection

from app.exceptions import (
    BonusHeadDuplicateError,
    BonusHeadNotFoundError,
    BonusHeadValidationError,
    DatabaseError,
)
from app.models.bonus_head import (
    BonusHeadCreate,
    BonusHeadDetail,
    BonusHeadResponse,
    BonusHeadUpdate,
    BudgetPeriod,
    LimitsUpsertRequest,
    OwnerEntry,
    OwnersUpsertRequest,
    SubheadSummary,
)

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# SQL — bonus_head
# ---------------------------------------------------------------------------

_INSERT_SQL = """
    INSERT INTO bonus_head
        (site_id, name, description, active, owner, created_by, updated_by, row_hash)
    VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, site_id, name, description, active, owner,
           created_by, updated_by, created_at, updated_at
    FROM bonus_head
    WHERE id = %s
"""

_LIST_SQL = """
    SELECT id, site_id, name, description, active, owner,
           created_by, updated_by, created_at, updated_at
    FROM bonus_head
    WHERE site_id = %s
    ORDER BY id
"""

_EXISTS_SQL = """
    SELECT 1 FROM bonus_head WHERE site_id = %s AND name = %s LIMIT 1
"""

# Returns only site_id — used where a full row read is not needed.
_EXISTS_HEAD_SQL = "SELECT site_id FROM bonus_head WHERE id = %s"

# ---------------------------------------------------------------------------
# SQL — bonus_owners / bonus_budget_limit upserts
# ---------------------------------------------------------------------------

_UPSERT_OWNER_SQL = """
    INSERT INTO bonus_owners
        (entity_type, entity_id, site_id, username, role, active, created_by, updated_by, row_hash)
    VALUES
        ('HEAD', %s, %s, %s, %s, %s, %s, %s, %s)
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
        ('HEAD', %s, %s, %s, %s, %s, %s, %s)
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
    WHERE entity_type = 'HEAD' AND entity_id = %s
    ORDER BY role
"""

_SELECT_SUBHEADS_SQL = """
    SELECT id, name, description, active, owner
    FROM bonus_subhead
    WHERE head_id = %s
    ORDER BY id
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
    WHERE bl.entity_type = 'HEAD' AND bl.entity_id = %s
    ORDER BY CASE bl.period_type
        WHEN 'DAILY'   THEN 1
        WHEN 'WEEKLY'  THEN 2
        WHEN 'MONTHLY' THEN 3
    END
"""

# Pre-read: just the configured cap per period — no usage join needed.
_SELECT_LIMITS_PRE_SQL = """
    SELECT period_type, budget_limit
    FROM bonus_budget_limit
    WHERE entity_type = 'HEAD' AND entity_id = %s
"""

_AUDIT_INSERT_SQL = """
    INSERT INTO bonus_change_log
        (table_name, action, entity_id, site_id, changed_by, old_values, new_values)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
"""

# ---------------------------------------------------------------------------
# Hash helpers
# ---------------------------------------------------------------------------


def _compute_row_hash(fields: dict) -> str:
    """SHA-256 of the canonical JSON of mutable row fields."""
    payload = json.dumps(fields, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Business-rule validation
# ---------------------------------------------------------------------------


def _validate_business_rules(data: BonusHeadCreate) -> None:
    if data.owner.isdigit():
        raise BonusHeadValidationError("owner", "owner must be a username or email, not a numeric id")
    if data.created_by.isdigit():
        raise BonusHeadValidationError("created_by", "created_by must be a username or email, not a numeric id")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _as_dt(value: object) -> datetime:
    return value if isinstance(value, datetime) else datetime.fromisoformat(str(value))


async def _write_audit(
    table_name: str, action: str, entity_id: int, site_id: int,
    changed_by: str, old_values: dict | None, new_values: dict | None,
) -> None:
    """Best-effort audit entry — never raises, errors are logged as warnings."""
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_AUDIT_INSERT_SQL, (
                    table_name, action, entity_id, site_id, changed_by,
                    json.dumps(old_values, default=str) if old_values is not None else None,
                    json.dumps(new_values, default=str) if new_values is not None else None,
                ))
                await conn.commit()
    except Exception as exc:
        log.warning("audit_write.failed", table=table_name, entity_id=entity_id, error=str(exc))


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def add_bonus_head(data: BonusHeadCreate) -> BonusHeadResponse:
    """
    Validate and insert a new bonus_head row.

    Raises:
        BonusHeadValidationError: on business-rule violations.
        BonusHeadDuplicateError:  when (site_id, name) already exists.
        DatabaseError:            on unexpected DB failures.
    """
    _validate_business_rules(data)

    log.info("add_bonus_head.start", site_id=data.site_id, name=data.name, owner=data.owner)

    row_hash = _compute_row_hash({
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
                await cur.execute(_EXISTS_SQL, (data.site_id, data.name))
                if await cur.fetchone():
                    raise BonusHeadDuplicateError(data.site_id, data.name)

                await cur.execute(
                    _INSERT_SQL,
                    (
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

                # Budget caps are part of the create contract — written in the
                # same transaction so a head can never exist without them.
                for entry in data.budget:
                    limit_row_hash = _compute_row_hash({
                        "entity_type": "HEAD",
                        "entity_id": new_id,
                        "site_id": data.site_id,
                        "period_type": entry.period_type,
                        "budget_limit": str(entry.budget_limit),
                        "updated_by": data.created_by,
                    })
                    await cur.execute(
                        _UPSERT_LIMIT_SQL,
                        (
                            new_id,
                            data.site_id,
                            entry.period_type,
                            entry.budget_limit,
                            data.created_by,
                            data.created_by,
                            limit_row_hash,
                        ),
                    )

                await conn.commit()
                await _write_audit(
                    "bonus_head", "INSERT", new_id, data.site_id, data.created_by,
                    None,
                    {"name": data.name, "description": data.description,
                     "active": int(data.active), "owner": data.owner},
                )
                for entry in data.budget:
                    new_limit = str(entry.budget_limit) if entry.budget_limit is not None else None
                    await _write_audit(
                        "bonus_head_budget", "INSERT", new_id, data.site_id, data.created_by,
                        None,
                        {"period_type": entry.period_type, "budget_limit": new_limit},
                    )

                await cur.execute(_SELECT_SQL, (new_id,))
                row = await cur.fetchone()

    except (BonusHeadDuplicateError, BonusHeadValidationError):
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusHeadDuplicateError(data.site_id, data.name) from exc
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("add_bonus_head.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    if row is None:
        raise DatabaseError("Insert succeeded but row could not be retrieved")

    response = BonusHeadResponse(
        id=row[0],
        site_id=row[1],
        name=row[2],
        description=row[3],
        active=bool(row[4]),
        owner=row[5],
        created_by=row[6],
        updated_by=row[7],
        created_at=_as_dt(row[8]),
        updated_at=_as_dt(row[9]),
    )
    log.info("add_bonus_head.created", bonus_head_id=response.id, site_id=response.site_id)
    return response


async def get_bonus_head(head_id: int) -> BonusHeadDetail:
    """
    Return full bonus head detail: core fields, owners, subheads, and budget.

    Raises:
        BonusHeadNotFoundError: when the head_id does not exist.
        DatabaseError:          on unexpected DB failures.
    """
    log.info("get_bonus_head.start", bonus_head_id=head_id)

    try:
        async with get_connection() as conn:
            await conn.commit()  # close any open transaction from pool reuse, force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (head_id,))
                head_row = await cur.fetchone()
                if head_row is None:
                    raise BonusHeadNotFoundError(head_id)

                await cur.execute(_SELECT_OWNERS_SQL, (head_id,))
                owner_rows = await cur.fetchall()

                await cur.execute(_SELECT_SUBHEADS_SQL, (head_id,))
                subhead_rows = await cur.fetchall()

                await cur.execute(_SELECT_BUDGET_SQL, (head_id,))
                budget_rows = await cur.fetchall()

    except BonusHeadNotFoundError:
        raise
    except Exception as exc:
        log.error("get_bonus_head.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    return BonusHeadDetail(
        id=head_row[0],
        site_id=head_row[1],
        name=head_row[2],
        description=head_row[3],
        active=bool(head_row[4]),
        owner=head_row[5],
        created_by=head_row[6],
        updated_by=head_row[7],
        created_at=_as_dt(head_row[8]),
        updated_at=_as_dt(head_row[9]),
        owners=[OwnerEntry(username=r[0], role=r[1], active=bool(r[2])) for r in owner_rows],
        subheads=[
            SubheadSummary(id=r[0], name=r[1], description=r[2], active=bool(r[3]), owner=r[4])
            for r in subhead_rows
        ],
        budget=[
            BudgetPeriod(period_type=r[0], limit=r[1], used=r[2], reset_at=r[3])
            for r in budget_rows
        ],
    )


async def list_bonus_heads(site_id: int) -> list[BonusHeadResponse]:
    """Return all bonus heads for a given site, ordered by id."""
    log.info("list_bonus_heads.start", site_id=site_id)
    try:
        async with get_connection() as conn:
            await conn.commit()  # force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_LIST_SQL, (site_id,))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("list_bonus_heads.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    return [
        BonusHeadResponse(
            id=r[0], site_id=r[1], name=r[2], description=r[3],
            active=bool(r[4]), owner=r[5],
            created_by=r[6], updated_by=r[7],
            created_at=_as_dt(r[8]), updated_at=_as_dt(r[9]),
        )
        for r in rows
    ]


# Patchable bonus_head fields and their SQL column names.
_PATCHABLE: dict[str, str] = {
    "name": "name",
    "description": "description",
    "active": "active",
    "owner": "owner",
}


async def update_bonus_head(head_id: int, data: BonusHeadUpdate) -> BonusHeadResponse:
    """
    Partial update of a bonus_head row.

    Only fields present in the request body are written; updated_by is always set.
    The full row is read before the UPDATE to capture old values and to serve as
    the baseline for row_hash computation.

    Raises:
        BonusHeadValidationError: owner is a raw numeric id.
        BonusHeadNotFoundError:   head_id does not exist.
        BonusHeadDuplicateError:  new name conflicts with another head on the same site.
        DatabaseError:            unexpected DB failure.
    """
    if data.owner is not None and data.owner.isdigit():
        raise BonusHeadValidationError(
            "owner", "owner must be a username or email, not a numeric id"
        )

    updates: dict[str, object] = {}
    for field, col in _PATCHABLE.items():
        if field not in data.model_fields_set:
            continue
        val = getattr(data, field)
        updates[col] = int(val) if field == "active" and val is not None else val
    updates["updated_by"] = data.updated_by

    log.info("update_bonus_head.start", bonus_head_id=head_id, fields=list(updates))

    try:
        async with get_connection() as conn:
            await conn.commit()  # force fresh MVCC snapshot — pool connection may carry a stale transaction
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (head_id,))
                head_row = await cur.fetchone()
                if head_row is None:
                    raise BonusHeadNotFoundError(head_id)
                site_id: int = head_row[1]

                # Compute new full state and row_hash.
                new_values_cl: dict = {
                    "site_id": site_id,
                    "name": updates.get("name", head_row[2]),
                    "description": updates.get("description", head_row[3]),
                    "active": updates.get("active", int(head_row[4])),
                    "owner": updates.get("owner", head_row[5]),
                    "created_by": head_row[6],
                    "updated_by": data.updated_by,
                }
                row_hash = _compute_row_hash(new_values_cl)
                updates["row_hash"] = row_hash

                set_clause = ", ".join(f"`{col}` = %s" for col in updates)
                params: list[object] = list(updates.values()) + [head_id]

                await cur.execute(
                    f"UPDATE bonus_head SET {set_clause} WHERE id = %s", params
                )
                await conn.commit()

                # Compute diff and write audit entry
                _col_row_idx = {"name": 2, "description": 3, "active": 4, "owner": 5}
                old_audit: dict = {}
                for col, idx in _col_row_idx.items():
                    if col in updates:
                        old_v = head_row[idx]
                        new_v = updates[col]
                        changed = (int(old_v) != int(new_v)) if col == "active" else (old_v != new_v)
                        if changed:
                            old_audit[col] = int(old_v) if col == "active" else old_v
                new_audit = {k: new_values_cl[k] for k in ("name", "description", "active", "owner")}
                await _write_audit("bonus_head", "UPDATE", head_id, site_id, data.updated_by,
                                   old_audit if old_audit else None, new_audit)

                await cur.execute(_SELECT_SQL, (head_id,))
                updated_row = await cur.fetchone()

    except (BonusHeadNotFoundError, BonusHeadValidationError):
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusHeadDuplicateError(site_id, data.name) from exc  # type: ignore[arg-type]
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("update_bonus_head.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert updated_row is not None
    log.info("update_bonus_head.done", bonus_head_id=head_id)
    return BonusHeadResponse(
        id=updated_row[0],
        site_id=updated_row[1],
        name=updated_row[2],
        description=updated_row[3],
        active=bool(updated_row[4]),
        owner=updated_row[5],
        created_by=updated_row[6],
        updated_by=updated_row[7],
        created_at=_as_dt(updated_row[8]),
        updated_at=_as_dt(updated_row[9]),
    )


async def upsert_owners(head_id: int, data: OwnersUpsertRequest) -> list[OwnerEntry]:
    """
    Add or update owner assignments for a bonus head.

    Each entry is upserted on (entity_type, entity_id, username).
    Existing owners are read first so INSERT vs UPDATE is known for the change log.

    Returns all current owners for the head after the operation.

    Raises:
        BonusHeadNotFoundError: head_id does not exist.
        DatabaseError:          unexpected DB failure.
    """
    log.info("upsert_owners.start", bonus_head_id=head_id, count=len(data.owners))

    try:
        async with get_connection() as conn:
            await conn.commit()  # force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_EXISTS_HEAD_SQL, (head_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusHeadNotFoundError(head_id)
                site_id = row[0]

                for entry in data.owners:
                    row_hash = _compute_row_hash({
                        "entity_type": "HEAD",
                        "entity_id": head_id,
                        "site_id": site_id,
                        "username": entry.username,
                        "role": entry.role,
                        "active": int(entry.active),
                        "updated_by": data.updated_by,
                    })
                    await cur.execute(
                        _UPSERT_OWNER_SQL,
                        (
                            head_id,
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

                await cur.execute(_SELECT_OWNERS_SQL, (head_id,))
                owner_rows = await cur.fetchall()

    except BonusHeadNotFoundError:
        raise
    except Exception as exc:
        log.error("upsert_owners.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    log.info("upsert_owners.done", bonus_head_id=head_id)
    return [OwnerEntry(username=r[0], role=r[1], active=bool(r[2])) for r in owner_rows]


async def upsert_limits(head_id: int, data: LimitsUpsertRequest) -> list[BudgetPeriod]:
    """
    Set or update budget caps for a bonus head.

    Each entry is upserted on (entity_type, entity_id, period_type).
    Existing limits are read first so INSERT vs UPDATE is known for the change log.

    Returns all budget periods for the head (with current usage) after the operation.

    Raises:
        BonusHeadNotFoundError: head_id does not exist.
        DatabaseError:          unexpected DB failure.
    """
    log.info("upsert_limits.start", bonus_head_id=head_id, count=len(data.limits))

    try:
        async with get_connection() as conn:
            await conn.commit()  # force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_EXISTS_HEAD_SQL, (head_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusHeadNotFoundError(head_id)
                site_id = row[0]

                # Read existing limits for audit diff
                await cur.execute(_SELECT_LIMITS_PRE_SQL, (head_id,))
                existing_limits = {r[0]: r[1] for r in await cur.fetchall()}

                for entry in data.limits:
                    row_hash = _compute_row_hash({
                        "entity_type": "HEAD",
                        "entity_id": head_id,
                        "site_id": site_id,
                        "period_type": entry.period_type,
                        "budget_limit": str(entry.budget_limit),
                        "updated_by": data.updated_by,
                    })
                    await cur.execute(
                        _UPSERT_LIMIT_SQL,
                        (
                            head_id,
                            site_id,
                            entry.period_type,
                            entry.budget_limit,
                            data.updated_by,
                            data.updated_by,
                            row_hash,
                        ),
                    )

                await conn.commit()

                for entry in data.limits:
                    old_l = existing_limits.get(entry.period_type)
                    new_l = entry.budget_limit
                    if str(old_l) != str(new_l):
                        await _write_audit(
                            "bonus_head_budget",
                            "UPDATE" if entry.period_type in existing_limits else "INSERT",
                            head_id, site_id, data.updated_by,
                            {"budget_limit": str(old_l)} if old_l is not None else None,
                            {"period_type": entry.period_type,
                             "budget_limit": str(new_l) if new_l is not None else None},
                        )

                await cur.execute(_SELECT_BUDGET_SQL, (head_id,))
                budget_rows = await cur.fetchall()

    except BonusHeadNotFoundError:
        raise
    except Exception as exc:
        log.error("upsert_limits.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    log.info("upsert_limits.done", bonus_head_id=head_id)
    return [
        BudgetPeriod(period_type=r[0], limit=r[1], used=r[2], reset_at=r[3])
        for r in budget_rows
    ]
