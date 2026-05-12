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
    _write_change_log,
)

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# SQL — bonus_configure
# ---------------------------------------------------------------------------

_INSERT_SQL = """
    INSERT INTO bonus_configure
        (subhead_id, site_id, name, description,
         bonus_type, release_mode, product,
         start_date, end_date,
         wager_multiplier, no_of_chunks, release_bucket,
         chunk_expiry_days, bonus_expiry_days,
         wager_chip_type, credit_chip_type,
         bonus_amount_default, bonus_amount_max,
         priority, active, created_by, updated_by, row_hash)
    VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
         %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, subhead_id, site_id, name, description,
           bonus_type, release_mode, product,
           start_date, end_date,
           wager_multiplier, no_of_chunks, release_bucket,
           chunk_expiry_days, bonus_expiry_days,
           wager_chip_type, credit_chip_type,
           bonus_amount_default, bonus_amount_max,
           priority, active, created_by, updated_by, created_at, updated_at
    FROM bonus_configure
    WHERE id = %s
"""

# Checks parent subhead exists and returns site_id.
_EXISTS_SUBHEAD_SQL = "SELECT site_id FROM bonus_subhead WHERE id = %s"

# Duplicate name check within the same subhead.
_EXISTS_CONFIGURE_SQL = (
    "SELECT 1 FROM bonus_configure WHERE subhead_id = %s AND name = %s LIMIT 1"
)

# ---------------------------------------------------------------------------
# SQL — default bonus_configure_code entry
# ---------------------------------------------------------------------------

_INSERT_CODE_SQL = """
    INSERT INTO bonus_configure_code
        (configure_id, site_id, code, active, created_by, updated_by, row_hash)
    VALUES
        (%s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_CODES_SQL = """
    SELECT id, code, max_amount, valid_from, valid_to, auto_apply, display_order, active
    FROM bonus_configure_code
    WHERE configure_id = %s
    ORDER BY display_order
"""

# ---------------------------------------------------------------------------
# Patchable columns for UPDATE
# ---------------------------------------------------------------------------

_PATCHABLE: dict[str, str] = {
    "name":                   "name",
    "description":            "description",
    "bonus_type":             "bonus_type",
    "release_mode":           "release_mode",
    "product":                "product",
    "start_date":             "start_date",
    "end_date":               "end_date",
    "wager_multiplier":       "wager_multiplier",
    "no_of_chunks":           "no_of_chunks",
    "release_bucket":         "release_bucket",
    "chunk_expiry_days":      "chunk_expiry_days",
    "bonus_expiry_days":      "bonus_expiry_days",
    "wager_chip_type":        "wager_chip_type",
    "credit_chip_type":       "credit_chip_type",
    "bonus_amount_default":   "bonus_amount_default",
    "bonus_amount_max":       "bonus_amount_max",
    "priority":               "priority",
    "active":                 "active",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_response(row: tuple) -> BonusConfigureResponse:
    return BonusConfigureResponse(
        id=row[0], subhead_id=row[1], site_id=row[2], name=row[3], description=row[4],
        bonus_type=row[5], release_mode=row[6], product=row[7],
        start_date=row[8], end_date=row[9],
        wager_multiplier=row[10], no_of_chunks=row[11], release_bucket=row[12],
        chunk_expiry_days=row[13], bonus_expiry_days=row[14],
        wager_chip_type=row[15], credit_chip_type=row[16],
        bonus_amount_default=row[17], bonus_amount_max=row[18],
        priority=row[19], active=bool(row[20]),
        created_by=row[21], updated_by=row[22],
        created_at=_as_dt(row[23]), updated_at=_as_dt(row[24]),
    )


def _configure_row_hash(data: BonusConfigureCreate | dict) -> str:
    if isinstance(data, BonusConfigureCreate):
        fields = {
            "subhead_id": data.subhead_id,
            "site_id": data.site_id,
            "name": data.name,
            "description": data.description,
            "bonus_type": data.bonus_type,
            "release_mode": data.release_mode,
            "product": data.product,
            "start_date": str(data.start_date),
            "end_date": str(data.end_date),
            "wager_multiplier": str(data.wager_multiplier),
            "no_of_chunks": data.no_of_chunks,
            "release_bucket": data.release_bucket,
            "chunk_expiry_days": data.chunk_expiry_days,
            "bonus_expiry_days": data.bonus_expiry_days,
            "wager_chip_type": data.wager_chip_type,
            "credit_chip_type": data.credit_chip_type,
            "bonus_amount_default": str(data.bonus_amount_default) if data.bonus_amount_default is not None else None,
            "bonus_amount_max": str(data.bonus_amount_max) if data.bonus_amount_max is not None else None,
            "priority": data.priority,
            "active": int(data.active),
            "created_by": data.created_by,
            "updated_by": data.created_by,
        }
    else:
        fields = data
    return _compute_row_hash(fields)


def _code_row_hash(configure_id: int, site_id: int, code: str, created_by: str) -> str:
    return _compute_row_hash({
        "configure_id": configure_id,
        "site_id": site_id,
        "code": code,
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
                        data.bonus_type, data.release_mode, data.product,
                        data.start_date, data.end_date,
                        data.wager_multiplier, data.no_of_chunks, data.release_bucket,
                        data.chunk_expiry_days, data.bonus_expiry_days,
                        data.wager_chip_type, data.credit_chip_type,
                        data.bonus_amount_default, data.bonus_amount_max,
                        data.priority, int(data.active), data.created_by, data.created_by,
                        row_hash,
                    ),
                )
                new_id: int = cur.lastrowid  # type: ignore[assignment]

                new_values_cfg = {
                    "subhead_id": data.subhead_id, "site_id": data.site_id,
                    "name": data.name, "description": data.description,
                    "bonus_type": data.bonus_type, "release_mode": data.release_mode,
                    "product": data.product,
                    "start_date": str(data.start_date), "end_date": str(data.end_date),
                    "wager_multiplier": str(data.wager_multiplier),
                    "no_of_chunks": data.no_of_chunks,
                    "release_bucket": data.release_bucket,
                    "chunk_expiry_days": data.chunk_expiry_days,
                    "bonus_expiry_days": data.bonus_expiry_days,
                    "wager_chip_type": data.wager_chip_type,
                    "credit_chip_type": data.credit_chip_type,
                    "bonus_amount_default": str(data.bonus_amount_default) if data.bonus_amount_default is not None else None,
                    "bonus_amount_max": str(data.bonus_amount_max) if data.bonus_amount_max is not None else None,
                    "priority": data.priority, "active": int(data.active),
                    "created_by": data.created_by, "updated_by": data.created_by,
                }

                await _write_change_log(
                    cur,
                    cl_table="bonus_configure_change_log",
                    entity_id=new_id,
                    site_id=data.site_id,
                    action="INSERT",
                    changed_by=data.created_by,
                    new_values=new_values_cfg,
                )

                # Insert default promo code entry.
                default_code = f"AUTO-{new_id}"
                code_hash = _code_row_hash(new_id, data.site_id, default_code, data.created_by)
                await cur.execute(
                    _INSERT_CODE_SQL,
                    (new_id, data.site_id, default_code, 1, data.created_by, data.created_by, code_hash),
                )
                new_code_id: int = cur.lastrowid  # type: ignore[assignment]

                await _write_change_log(
                    cur,
                    cl_table="bonus_configure_code_change_log",
                    entity_id=new_code_id,
                    site_id=data.site_id,
                    action="INSERT",
                    changed_by=data.created_by,
                    new_values={
                        "configure_id": new_id, "site_id": data.site_id,
                        "code": default_code, "active": 1,
                        "created_by": data.created_by, "updated_by": data.created_by,
                    },
                )

                await conn.commit()

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

                subhead_id: int = row[1]
                site_id: int    = row[2]

                old_values_cl: dict = {
                    "subhead_id": row[1], "site_id": row[2], "name": row[3], "description": row[4],
                    "bonus_type": row[5], "release_mode": row[6], "product": row[7],
                    "start_date": str(row[8]), "end_date": str(row[9]),
                    "wager_multiplier": str(row[10]), "no_of_chunks": row[11],
                    "release_bucket": row[12],
                    "chunk_expiry_days": row[13], "bonus_expiry_days": row[14],
                    "wager_chip_type": row[15], "credit_chip_type": row[16],
                    "bonus_amount_default": str(row[17]) if row[17] is not None else None,
                    "bonus_amount_max": str(row[18]) if row[18] is not None else None,
                    "priority": row[19], "active": int(row[20]),
                    "created_by": row[21], "updated_by": row[22],
                }

                new_values_cl: dict = {
                    "subhead_id": subhead_id, "site_id": site_id,
                    "name": updates.get("name", row[3]),
                    "description": updates.get("description", row[4]),
                    "bonus_type": updates.get("bonus_type", row[5]),
                    "release_mode": updates.get("release_mode", row[6]),
                    "product": updates.get("product", row[7]),
                    "start_date": str(updates.get("start_date", row[8])),
                    "end_date": str(updates.get("end_date", row[9])),
                    "wager_multiplier": str(updates.get("wager_multiplier", row[10])),
                    "no_of_chunks": updates.get("no_of_chunks", row[11]),
                    "release_bucket": updates.get("release_bucket", row[12]),
                    "chunk_expiry_days": updates.get("chunk_expiry_days", row[13]),
                    "bonus_expiry_days": updates.get("bonus_expiry_days", row[14]),
                    "wager_chip_type": updates.get("wager_chip_type", row[15]),
                    "credit_chip_type": updates.get("credit_chip_type", row[16]),
                    "bonus_amount_default": str(updates.get("bonus_amount_default", row[17])) if updates.get("bonus_amount_default", row[17]) is not None else None,
                    "bonus_amount_max": str(updates.get("bonus_amount_max", row[18])) if updates.get("bonus_amount_max", row[18]) is not None else None,
                    "priority": updates.get("priority", row[19]),
                    "active": updates.get("active", int(row[20])),
                    "created_by": row[21],
                    "updated_by": data.updated_by,
                }
                row_hash = _configure_row_hash(new_values_cl)
                updates["row_hash"] = row_hash

                set_clause = ", ".join(f"`{col}` = %s" for col in updates)
                params: list[object] = list(updates.values()) + [configure_id]

                await cur.execute(
                    f"UPDATE bonus_configure SET {set_clause} WHERE id = %s", params
                )
                await _write_change_log(
                    cur,
                    cl_table="bonus_configure_change_log",
                    entity_id=configure_id,
                    site_id=site_id,
                    action="UPDATE",
                    changed_by=data.updated_by,
                    old_values=old_values_cl,
                    new_values=new_values_cl,
                )
                await conn.commit()

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
