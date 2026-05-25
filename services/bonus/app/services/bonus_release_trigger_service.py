import aiomysql
import structlog

from shared.clients.mysql import get_connection

from app.exceptions import (
    BonusCodeNotFoundError,
    BonusReleaseTriggerDuplicateError,
    BonusReleaseTriggerNotFoundError,
    BonusReleaseTriggerValidationError,
    DatabaseError,
)
from app.models.bonus_release_trigger import (
    BonusReleaseTriggerCreate,
    BonusReleaseTriggerResponse,
    BonusReleaseTriggerUpdate,
)
from app.services.bonus_head_service import (
    _as_dt,
    _compute_row_hash,
)

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

# Resolve code → configure_id via bonus_configure_code
_RESOLVE_CODE_SQL = """
    SELECT configure_id, site_id
    FROM bonus_configure_code
    WHERE site_id = %s AND code = %s AND active = 1
    LIMIT 1
"""

_EXISTS_TRIGGER_SQL = (
    "SELECT 1 FROM bonus_release_trigger "
    "WHERE configure_id = %s AND trigger_type = %s LIMIT 1"
)

_INSERT_SQL = """
    INSERT INTO bonus_release_trigger
        (configure_id, site_id, trigger_type, description,
         min_trigger_amount, max_trigger_amount,
         payment_method, product, occurrence,
         active, created_by, updated_by, row_hash)
    VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, configure_id, site_id, trigger_type, description,
           min_trigger_amount, max_trigger_amount,
           payment_method, product, occurrence,
           active, created_by, updated_by, created_at, updated_at
    FROM bonus_release_trigger
    WHERE id = %s
"""

# ---------------------------------------------------------------------------
# Patchable columns
# ---------------------------------------------------------------------------

_PATCHABLE: dict[str, str] = {
    "trigger_type":       "trigger_type",
    "description":        "description",
    "min_trigger_amount": "min_trigger_amount",
    "max_trigger_amount": "max_trigger_amount",
    "payment_method":     "payment_method",
    "product":            "product",
    "occurrence":         "occurrence",
    "active":             "active",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_response(row: tuple) -> BonusReleaseTriggerResponse:
    # id[0] configure_id[1] site_id[2] trigger_type[3] description[4]
    # min_trigger_amount[5] max_trigger_amount[6] payment_method[7] product[8]
    # occurrence[9] active[10] created_by[11] updated_by[12] created_at[13] updated_at[14]
    return BonusReleaseTriggerResponse(
        id=row[0], configure_id=row[1], site_id=row[2],
        trigger_type=row[3], description=row[4],
        min_trigger_amount=row[5], max_trigger_amount=row[6],
        payment_method=row[7], product=row[8],
        occurrence=row[9],
        active=bool(row[10]),
        created_by=row[11], updated_by=row[12],
        created_at=_as_dt(row[13]), updated_at=_as_dt(row[14]),
    )


def _trigger_row_hash(data: BonusReleaseTriggerCreate | dict) -> str:
    if isinstance(data, BonusReleaseTriggerCreate):
        fields: dict = {
            "configure_id":       None,  # filled after resolution
            "site_id":            data.site_id,
            "trigger_type":       data.trigger_type,
            "description":        data.description,
            "min_trigger_amount": str(data.min_trigger_amount) if data.min_trigger_amount is not None else None,
            "max_trigger_amount": str(data.max_trigger_amount) if data.max_trigger_amount is not None else None,
            "payment_method":     data.payment_method,
            "product":            data.product,
            "occurrence":         data.occurrence,
            "active":             int(data.active),
            "created_by":         data.created_by,
            "updated_by":         data.created_by,
        }
    else:
        fields = data
    return _compute_row_hash(fields)

# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def add_bonus_release_trigger(
    data: BonusReleaseTriggerCreate,
) -> BonusReleaseTriggerResponse:
    """
    Resolve ``code`` → ``configure_id``, then insert a new bonus_release_trigger row.

    Raises:
        BonusReleaseTriggerValidationError: on business-rule violations.
        BonusCodeNotFoundError:             when the promo code is not found or inactive.
        BonusReleaseTriggerDuplicateError:  when (configure_id, trigger_type) already exists.
        DatabaseError:                      on unexpected DB failures.
    """
    if data.created_by.isdigit():
        raise BonusReleaseTriggerValidationError(
            "created_by", "created_by must be a username or email, not a numeric id"
        )

    log.info("add_bonus_release_trigger.start", code=data.code, trigger_type=data.trigger_type)

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                # Resolve promo code → configure_id
                await cur.execute(_RESOLVE_CODE_SQL, (data.site_id, data.code))
                code_row = await cur.fetchone()
                if code_row is None:
                    raise BonusCodeNotFoundError(data.site_id, data.code)
                configure_id: int = code_row[0]

                # Duplicate (configure_id, trigger_type) guard
                await cur.execute(_EXISTS_TRIGGER_SQL, (configure_id, data.trigger_type))
                if await cur.fetchone():
                    raise BonusReleaseTriggerDuplicateError(configure_id, data.trigger_type)

                hash_fields = {
                    "configure_id":       configure_id,
                    "site_id":            data.site_id,
                    "trigger_type":       data.trigger_type,
                    "description":        data.description,
                    "min_trigger_amount": str(data.min_trigger_amount) if data.min_trigger_amount is not None else None,
                    "max_trigger_amount": str(data.max_trigger_amount) if data.max_trigger_amount is not None else None,
                    "payment_method":     data.payment_method,
                    "product":            data.product,
                    "occurrence":         data.occurrence,
                    "active":             int(data.active),
                    "created_by":         data.created_by,
                    "updated_by":         data.created_by,
                }
                row_hash = _compute_row_hash(hash_fields)

                await cur.execute(
                    _INSERT_SQL,
                    (
                        configure_id, data.site_id, data.trigger_type, data.description,
                        data.min_trigger_amount, data.max_trigger_amount,
                        data.payment_method, data.product,
                        data.occurrence,
                        int(data.active), data.created_by, data.created_by, row_hash,
                    ),
                )
                new_id: int = cur.lastrowid  # type: ignore[assignment]

                await conn.commit()

                await cur.execute(_SELECT_SQL, (new_id,))
                row = await cur.fetchone()

    except (BonusCodeNotFoundError, BonusReleaseTriggerDuplicateError,
            BonusReleaseTriggerValidationError):
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusReleaseTriggerDuplicateError(configure_id, data.trigger_type) from exc  # type: ignore[possibly-undefined]
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("add_bonus_release_trigger.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    if row is None:
        raise DatabaseError("Insert succeeded but row could not be retrieved")

    response = _row_to_response(row)
    log.info("add_bonus_release_trigger.created", trigger_id=response.id, configure_id=response.configure_id)
    return response


async def get_bonus_release_trigger(trigger_id: int) -> BonusReleaseTriggerResponse:
    """
    Return a single bonus_release_trigger row by id.

    Raises:
        BonusReleaseTriggerNotFoundError: when the trigger_id does not exist.
        DatabaseError:                    on unexpected DB failures.
    """
    log.info("get_bonus_release_trigger.start", trigger_id=trigger_id)

    try:
        async with get_connection() as conn:
            await conn.commit()  # force fresh MVCC snapshot
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (trigger_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusReleaseTriggerNotFoundError(trigger_id)

    except BonusReleaseTriggerNotFoundError:
        raise
    except Exception as exc:
        log.error("get_bonus_release_trigger.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    return _row_to_response(row)


async def update_bonus_release_trigger(
    trigger_id: int, data: BonusReleaseTriggerUpdate
) -> BonusReleaseTriggerResponse:
    """
    Partial update of a bonus_release_trigger row.

    Raises:
        BonusReleaseTriggerNotFoundError:  trigger_id does not exist.
        BonusReleaseTriggerDuplicateError: new trigger_type conflicts on same configure.
        DatabaseError:                     unexpected DB failure.
    """
    updates: dict[str, object] = {}
    for field, col in _PATCHABLE.items():
        if field not in data.model_fields_set:
            continue
        val = getattr(data, field)
        updates[col] = int(val) if field == "active" and val is not None else val
    updates["updated_by"] = data.updated_by

    log.info("update_bonus_release_trigger.start", trigger_id=trigger_id, fields=list(updates))

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (trigger_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusReleaseTriggerNotFoundError(trigger_id)

                site_id: int     = row[2]
                configure_id_row = row[1]

                new_values_cl: dict = {
                    "configure_id":       configure_id_row, "site_id": site_id,
                    "trigger_type":       updates.get("trigger_type", row[3]),
                    "description":        updates.get("description", row[4]),
                    "min_trigger_amount": str(updates.get("min_trigger_amount", row[5])) if updates.get("min_trigger_amount", row[5]) is not None else None,
                    "max_trigger_amount": str(updates.get("max_trigger_amount", row[6])) if updates.get("max_trigger_amount", row[6]) is not None else None,
                    "payment_method":     updates.get("payment_method", row[7]),
                    "product":            updates.get("product", row[8]),
                    "occurrence":         updates.get("occurrence", row[9]),
                    "active":             updates.get("active", int(row[10])),
                    "created_by":         row[11],
                    "updated_by":         data.updated_by,
                }
                row_hash = _compute_row_hash(new_values_cl)
                updates["row_hash"] = row_hash

                set_clause = ", ".join(f"`{col}` = %s" for col in updates)
                params: list[object] = list(updates.values()) + [trigger_id]

                await cur.execute(
                    f"UPDATE bonus_release_trigger SET {set_clause} WHERE id = %s", params
                )
                await conn.commit()

                await cur.execute(_SELECT_SQL, (trigger_id,))
                updated_row = await cur.fetchone()

    except BonusReleaseTriggerNotFoundError:
        raise
    except aiomysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise BonusReleaseTriggerDuplicateError(configure_id_row, data.trigger_type) from exc  # type: ignore[possibly-undefined]
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("update_bonus_release_trigger.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    assert updated_row is not None
    log.info("update_bonus_release_trigger.done", trigger_id=trigger_id)
    return _row_to_response(updated_row)
