import json

import aiomysql
import structlog

from shared.clients.mysql import get_connection

from app.exceptions import (
    BonusConfigureDuplicateError,
    BonusConfigureNotFoundError,
    BonusConfigureValidationError,
    DatabaseError,
)
from app.models.bonus_configure import (
    BonusCodeSummary,
    BonusConfigureCreate,
    BonusConfigureDetail,
    BonusConfigureResponse,
    BonusConfigureUpdate,
)
from app.services.bonus_head_service import (
    _as_dt,
    _compute_row_hash,
)

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# SQL — bonus_configure
# ---------------------------------------------------------------------------

_INSERT_SQL = """
    INSERT INTO bonus_configure
        (subhead_id, site_id, name, description,
         start_date, end_date, applicability_frequency,
         wager_multiplier, no_of_chunks, release_bucket,
         chunk_expiry_days, bonus_expiry_days,
         wager_chip_type, credit_chip_type,
         bonus_amount_fixed, bonus_amount_percent, bonus_amount_max,
         cashback_bonus_amount_fixed, cashback_bonus_amount_percent, cashback_bonus_amount_max,
         priority, active, created_by, updated_by, row_hash)
    VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
         %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, subhead_id, site_id, name, description,
           start_date, end_date, applicability_frequency,
           wager_multiplier, no_of_chunks, release_bucket,
           chunk_expiry_days, bonus_expiry_days,
           wager_chip_type, credit_chip_type,
           bonus_amount_fixed, bonus_amount_percent, bonus_amount_max,
           cashback_bonus_amount_fixed, cashback_bonus_amount_percent, cashback_bonus_amount_max,
           priority, active, created_by, updated_by, created_at, updated_at
    FROM bonus_configure
    WHERE id = %s
"""

_LIST_BY_SUBHEAD_SQL = """
    SELECT id, subhead_id, site_id, name, description,
           start_date, end_date, applicability_frequency,
           wager_multiplier, no_of_chunks, release_bucket,
           chunk_expiry_days, bonus_expiry_days,
           wager_chip_type, credit_chip_type,
           bonus_amount_fixed, bonus_amount_percent, bonus_amount_max,
           cashback_bonus_amount_fixed, cashback_bonus_amount_percent, cashback_bonus_amount_max,
           priority, active, created_by, updated_by, created_at, updated_at
    FROM bonus_configure
    WHERE subhead_id = %s
    ORDER BY priority ASC, id ASC
"""

# Checks parent subhead exists and returns site_id.
_EXISTS_SUBHEAD_SQL = "SELECT site_id FROM bonus_subhead WHERE id = %s"

# Duplicate name check within the same subhead.
_EXISTS_CONFIGURE_SQL = (
    "SELECT 1 FROM bonus_configure WHERE subhead_id = %s AND name = %s LIMIT 1"
)

_SELECT_CODES_SQL = """
    SELECT id, code, max_amount, valid_from, valid_to, auto_apply, display_order, active
    FROM bonus_configure_code
    WHERE configure_id = %s
    ORDER BY display_order
"""

# ---------------------------------------------------------------------------
# SQL — audit log
# ---------------------------------------------------------------------------

_AUDIT_INSERT_SQL = """
    INSERT INTO bonus_change_log
        (table_name, action, entity_id, site_id, changed_by, old_values, new_values)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
"""

# ---------------------------------------------------------------------------
# Patchable columns for UPDATE
# ---------------------------------------------------------------------------

_PATCHABLE: dict[str, str] = {
    "name":                       "name",
    "description":                "description",
    "start_date":                 "start_date",
    "end_date":                   "end_date",
    "applicability_frequency":    "applicability_frequency",
    "wager_multiplier":           "wager_multiplier",
    "no_of_chunks":               "no_of_chunks",
    "release_bucket":             "release_bucket",
    "chunk_expiry_days":          "chunk_expiry_days",
    "bonus_expiry_days":          "bonus_expiry_days",
    "wager_chip_type":            "wager_chip_type",
    "credit_chip_type":           "credit_chip_type",
    "bonus_amount_fixed":              "bonus_amount_fixed",
    "bonus_amount_percent":            "bonus_amount_percent",
    "bonus_amount_max":                "bonus_amount_max",
    "cashback_bonus_amount_fixed":     "cashback_bonus_amount_fixed",
    "cashback_bonus_amount_percent":   "cashback_bonus_amount_percent",
    "cashback_bonus_amount_max":       "cashback_bonus_amount_max",
    "priority":                        "priority",
    "active":                     "active",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _write_audit(
    table_name: str, action: str, entity_id: int, site_id: int,
    changed_by: str, old_values: dict | None, new_values: dict | None,
) -> None:
    """Best-effort audit entry — never raises."""
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_AUDIT_INSERT_SQL, (
                    table_name, action, entity_id, site_id, changed_by,
                    json.dumps(old_values) if old_values is not None else None,
                    json.dumps(new_values, default=str) if new_values is not None else None,
                ))
                await conn.commit()
    except Exception as exc:
        log.warning("audit_write.failed", table=table_name, entity_id=entity_id, error=str(exc))


def _row_to_response(row: tuple) -> BonusConfigureResponse:
    # SELECT col order: id[0] subhead_id[1] site_id[2] name[3] description[4]
    #   start_date[5] end_date[6] applicability_frequency[7]
    #   wager_multiplier[8] no_of_chunks[9] release_bucket[10]
    #   chunk_expiry_days[11] bonus_expiry_days[12] wager_chip_type[13] credit_chip_type[14]
    #   bonus_amount_fixed[15] bonus_amount_percent[16] bonus_amount_max[17]
    #   cashback_bonus_amount_fixed[18] cashback_bonus_amount_percent[19] cashback_bonus_amount_max[20]
    #   priority[21] active[22] created_by[23] updated_by[24] created_at[25] updated_at[26]
    return BonusConfigureResponse(
        id=row[0], subhead_id=row[1], site_id=row[2], name=row[3], description=row[4],
        start_date=_as_dt(row[5]), end_date=_as_dt(row[6]),
        applicability_frequency=row[7],
        wager_multiplier=row[8], no_of_chunks=row[9], release_bucket=row[10],
        chunk_expiry_days=row[11], bonus_expiry_days=row[12],
        wager_chip_type=row[13], credit_chip_type=row[14],
        bonus_amount_fixed=row[15], bonus_amount_percent=row[16], bonus_amount_max=row[17],
        cashback_bonus_amount_fixed=row[18], cashback_bonus_amount_percent=row[19], cashback_bonus_amount_max=row[20],
        priority=row[21], active=bool(row[22]),
        created_by=row[23], updated_by=row[24],
        created_at=_as_dt(row[25]), updated_at=_as_dt(row[26]),
    )


def _configure_row_hash(data: BonusConfigureCreate | dict) -> str:
    if isinstance(data, BonusConfigureCreate):
        fields = {
            "subhead_id": data.subhead_id,
            "site_id": data.site_id,
            "name": data.name,
            "description": data.description,
            "start_date": str(data.start_date),
            "end_date": str(data.end_date),
            "applicability_frequency": data.applicability_frequency,
            "wager_multiplier": str(data.wager_multiplier),
            "no_of_chunks": data.no_of_chunks,
            "release_bucket": data.release_bucket,
            "chunk_expiry_days": data.chunk_expiry_days,
            "bonus_expiry_days": data.bonus_expiry_days,
            "wager_chip_type": data.wager_chip_type,
            "credit_chip_type": data.credit_chip_type,
            "bonus_amount_fixed": str(data.bonus_amount_fixed) if data.bonus_amount_fixed is not None else None,
            "bonus_amount_percent": str(data.bonus_amount_percent) if data.bonus_amount_percent is not None else None,
            "bonus_amount_max": str(data.bonus_amount_max) if data.bonus_amount_max is not None else None,
            "cashback_bonus_amount_fixed": str(data.cashback_bonus_amount_fixed) if data.cashback_bonus_amount_fixed is not None else None,
            "cashback_bonus_amount_percent": str(data.cashback_bonus_amount_percent) if data.cashback_bonus_amount_percent is not None else None,
            "cashback_bonus_amount_max": str(data.cashback_bonus_amount_max) if data.cashback_bonus_amount_max is not None else None,
            "priority": data.priority,
            "active": int(data.active),
            "created_by": data.created_by,
            "updated_by": data.created_by,
        }
    else:
        fields = data
    return _compute_row_hash(fields)


def _code_row_hash(
    configure_id: int,
    site_id: int,
    code: str,
    created_by: str,
    max_amount: object = None,
    valid_from: object = None,
    valid_to: object = None,
) -> str:
    return _compute_row_hash({
        "configure_id": configure_id,
        "site_id": site_id,
        "code": code,
        "max_amount": str(max_amount) if max_amount is not None else None,
        "valid_from": str(valid_from) if valid_from is not None else None,
        "valid_to": str(valid_to) if valid_to is not None else None,
        "active": 1,
        "created_by": created_by,
        "updated_by": created_by,
    })


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def add_bonus_configure(data: BonusConfigureCreate) -> BonusConfigureResponse:
    """
    Validate and insert a new bonus_configure row plus a default promo code entry.

    The default code is named ``AUTO-{new_id}`` and carries no overrides so the
    configure node's own mechanics apply on redemption.

    Raises:
        BonusConfigureValidationError: on business-rule violations.
        BonusConfigureNotFoundError:   when parent subhead_id does not exist.
        BonusConfigureDuplicateError:  when (subhead_id, name) already exists.
        DatabaseError:                 on unexpected DB failures.
    """
    if data.created_by.isdigit():
        raise BonusConfigureValidationError(
            "created_by", "created_by must be a username or email, not a numeric id"
        )

    log.info("add_bonus_configure.start", subhead_id=data.subhead_id, name=data.name)

    row_hash = _configure_row_hash(data)

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                # Verify parent subhead exists.
                await cur.execute(_EXISTS_SUBHEAD_SQL, (data.subhead_id,))
                if await cur.fetchone() is None:
                    raise BonusConfigureNotFoundError(data.subhead_id)

                # Duplicate name guard.
                await cur.execute(_EXISTS_CONFIGURE_SQL, (data.subhead_id, data.name))
                if await cur.fetchone():
                    raise BonusConfigureDuplicateError(data.subhead_id, data.name)

                # Insert configure row.
                await cur.execute(
                    _INSERT_SQL,
                    (
                        data.subhead_id, data.site_id, data.name, data.description,
                        data.start_date, data.end_date, data.applicability_frequency,
                        data.wager_multiplier, data.no_of_chunks, data.release_bucket,
                        data.chunk_expiry_days, data.bonus_expiry_days,
                        data.wager_chip_type, data.credit_chip_type,
                        data.bonus_amount_fixed, data.bonus_amount_percent, data.bonus_amount_max,
                        data.cashback_bonus_amount_fixed, data.cashback_bonus_amount_percent, data.cashback_bonus_amount_max,
                        data.priority, int(data.active), data.created_by, data.created_by,
                        row_hash,
                    ),
                )
                new_id: int = cur.lastrowid  # type: ignore[assignment]

                await conn.commit()
                await _write_audit(
                    "bonus_configure", "INSERT", new_id, data.site_id, data.created_by,
                    None,
                    {"subhead_id": data.subhead_id, "name": data.name,
                     "description": data.description, "active": int(data.active),
                     "applicability_frequency": data.applicability_frequency},
                )

                await cur.execute(_SELECT_SQL, (new_id,))
                row = await cur.fetchone()

    except (BonusConfigureDuplicateError, BonusConfigureValidationError, BonusConfigureNotFoundError):
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusConfigureDuplicateError(data.subhead_id, data.name) from exc
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("add_bonus_configure.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    if row is None:
        raise DatabaseError("Insert succeeded but row could not be retrieved")

    response = _row_to_response(row)
    log.info("add_bonus_configure.created", bonus_configure_id=response.id)
    return response


async def get_bonus_configure(configure_id: int) -> BonusConfigureDetail:
    """
    Return a configure node with all its attached promo codes.

    Raises:
        BonusConfigureNotFoundError: when the configure_id does not exist.
        DatabaseError:               on unexpected DB failures.
    """
    log.info("get_bonus_configure.start", bonus_configure_id=configure_id)

    try:
        async with get_connection() as conn:
            await conn.commit()  # force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (configure_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusConfigureNotFoundError(configure_id)

                await cur.execute(_SELECT_CODES_SQL, (configure_id,))
                code_rows = await cur.fetchall()

    except BonusConfigureNotFoundError:
        raise
    except Exception as exc:
        log.error("get_bonus_configure.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    return BonusConfigureDetail(
        **_row_to_response(row).model_dump(),
        codes=[
            BonusCodeSummary(
                id=r[0], code=r[1], max_amount=r[2],
                valid_from=r[3], valid_to=r[4],
                auto_apply=bool(r[5]), display_order=r[6], active=bool(r[7]),
            )
            for r in code_rows
        ],
    )


async def list_bonus_configures_by_subhead(subhead_id: int) -> list[BonusConfigureResponse]:
    """Return all configure rows for the given subhead, ordered by priority then id."""
    try:
        async with get_connection() as conn:
            await conn.commit()  # force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_LIST_BY_SUBHEAD_SQL, (subhead_id,))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("list_bonus_configures.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    return [_row_to_response(row) for row in rows]


async def update_bonus_configure(configure_id: int, data: BonusConfigureUpdate) -> BonusConfigureResponse:
    """
    Partial update of a bonus_configure row.

    Only fields present in the request body are written; updated_by is always set.

    Raises:
        BonusConfigureNotFoundError:   configure_id does not exist.
        BonusConfigureDuplicateError:  new name conflicts within the same subhead.
        DatabaseError:                 unexpected DB failure.
    """
    updates: dict[str, object] = {}
    for field, col in _PATCHABLE.items():
        if field not in data.model_fields_set:
            continue
        val = getattr(data, field)
        updates[col] = int(val) if field == "active" and val is not None else val
    updates["updated_by"] = data.updated_by

    log.info("update_bonus_configure.start", bonus_configure_id=configure_id, fields=list(updates))

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (configure_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusConfigureNotFoundError(configure_id)

                subhead_id: int = row[1]  # unchanged
                site_id: int    = row[2]  # unchanged

                new_values_cl: dict = {
                    "subhead_id": subhead_id, "site_id": site_id,
                    "name": updates.get("name", row[3]),
                    "description": updates.get("description", row[4]),
                    "start_date": str(updates.get("start_date", row[5])),
                    "end_date": str(updates.get("end_date", row[6])),
                    "applicability_frequency": updates.get("applicability_frequency", row[7]),
                    "wager_multiplier": str(updates.get("wager_multiplier", row[8])),
                    "no_of_chunks": updates.get("no_of_chunks", row[9]),
                    "release_bucket": updates.get("release_bucket", row[10]),
                    "chunk_expiry_days": updates.get("chunk_expiry_days", row[11]),
                    "bonus_expiry_days": updates.get("bonus_expiry_days", row[12]),
                    "wager_chip_type": updates.get("wager_chip_type", row[13]),
                    "credit_chip_type": updates.get("credit_chip_type", row[14]),
                    "bonus_amount_fixed": str(updates.get("bonus_amount_fixed", row[15])) if updates.get("bonus_amount_fixed", row[15]) is not None else None,
                    "bonus_amount_percent": str(updates.get("bonus_amount_percent", row[16])) if updates.get("bonus_amount_percent", row[16]) is not None else None,
                    "bonus_amount_max": str(updates.get("bonus_amount_max", row[17])) if updates.get("bonus_amount_max", row[17]) is not None else None,
                    "cashback_bonus_amount_fixed": str(updates.get("cashback_bonus_amount_fixed", row[18])) if updates.get("cashback_bonus_amount_fixed", row[18]) is not None else None,
                    "cashback_bonus_amount_percent": str(updates.get("cashback_bonus_amount_percent", row[19])) if updates.get("cashback_bonus_amount_percent", row[19]) is not None else None,
                    "cashback_bonus_amount_max": str(updates.get("cashback_bonus_amount_max", row[20])) if updates.get("cashback_bonus_amount_max", row[20]) is not None else None,
                    "priority": updates.get("priority", row[21]),
                    "active": updates.get("active", int(row[22])),
                    "created_by": row[23],
                    "updated_by": data.updated_by,
                }
                row_hash = _configure_row_hash(new_values_cl)
                updates["row_hash"] = row_hash

                set_clause = ", ".join(f"`{col}` = %s" for col in updates)
                params: list[object] = list(updates.values()) + [configure_id]

                await cur.execute(
                    f"UPDATE bonus_configure SET {set_clause} WHERE id = %s", params
                )
                await conn.commit()

                _audit_col_idx = {
                    "name": 3, "description": 4, "applicability_frequency": 7,
                    "active": 22, "wager_multiplier": 8, "no_of_chunks": 9,
                    "bonus_amount_fixed": 15, "bonus_amount_percent": 16, "bonus_amount_max": 17,
                    "priority": 21,
                }
                old_audit: dict = {}
                for col, idx in _audit_col_idx.items():
                    if col in updates:
                        old_v = row[idx]
                        new_v = updates[col]
                        changed = (int(old_v) != int(new_v)) if col == "active" else (str(old_v) != str(new_v))
                        if changed:
                            old_audit[col] = int(old_v) if col == "active" else old_v
                await _write_audit(
                    "bonus_configure", "UPDATE", configure_id, site_id, data.updated_by,
                    old_audit if old_audit else None,
                    {"name": new_values_cl["name"], "active": new_values_cl["active"]},
                )

                await cur.execute(_SELECT_SQL, (configure_id,))
                updated_row = await cur.fetchone()

    except BonusConfigureNotFoundError:
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusConfigureDuplicateError(subhead_id, data.name) from exc  # type: ignore[arg-type]
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("update_bonus_configure.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert updated_row is not None
    log.info("update_bonus_configure.done", bonus_configure_id=configure_id)
    return _row_to_response(updated_row)
