import json

import aiomysql
import structlog

from shared.clients.mysql import POOL_BONUS, get_connection

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

_RESOLVE_CODE_SQL = """
    SELECT configure_id, site_id
    FROM bonus_configure_code
    WHERE site_id = %s AND code = %s AND active = 1
    LIMIT 1
"""

_EXISTS_CONFIGURE_SQL = "SELECT id FROM bonus_configure WHERE id = %s LIMIT 1"

_EXISTS_TRIGGER_SQL = (
    "SELECT 1 FROM bonus_release_trigger "
    "WHERE configure_id = %s AND trigger_type = %s LIMIT 1"
)

_INSERT_SQL = """
    INSERT INTO bonus_release_trigger
        (configure_id, site_id, trigger_type, trigger_config,
         active, created_by, updated_by, row_hash)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, configure_id, site_id, trigger_type, trigger_config,
           active, created_by, updated_by, created_at, updated_at
    FROM bonus_release_trigger
    WHERE id = %s
"""

_DELETE_SQL = "DELETE FROM bonus_release_trigger WHERE id = %s"

# ---------------------------------------------------------------------------
# Patchable columns
# ---------------------------------------------------------------------------

_PATCHABLE: dict[str, str] = {
    "trigger_type":   "trigger_type",
    "trigger_config": "trigger_config",
    "active":         "active",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_response(row: tuple) -> BonusReleaseTriggerResponse:
    # id[0] configure_id[1] site_id[2] trigger_type[3] trigger_config[4]
    # active[5] created_by[6] updated_by[7] created_at[8] updated_at[9]
    raw_cfg = row[4]
    if isinstance(raw_cfg, str):
        try:
            raw_cfg = json.loads(raw_cfg)
        except Exception:
            raw_cfg = None
    return BonusReleaseTriggerResponse(
        id=row[0], configure_id=row[1], site_id=row[2],
        trigger_type=row[3], trigger_config=raw_cfg,
        active=bool(row[5]),
        created_by=row[6], updated_by=row[7],
        created_at=_as_dt(row[8]), updated_at=_as_dt(row[9]),
    )


def _hash_fields(configure_id: int, site_id: int, data: BonusReleaseTriggerCreate | dict, updated_by: str) -> str:
    if isinstance(data, BonusReleaseTriggerCreate):
        fields: dict = {
            "configure_id":   configure_id,
            "site_id":        site_id,
            "trigger_type":   data.trigger_type,
            "trigger_config": json.dumps(data.trigger_config, sort_keys=True) if data.trigger_config else None,
            "active":         int(data.active),
            "created_by":     data.created_by,
            "updated_by":     updated_by,
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
    log.info("add_bonus_release_trigger.start", code=data.code, trigger_type=data.trigger_type)

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                if data.configure_id is not None:
                    await cur.execute(_EXISTS_CONFIGURE_SQL, (data.configure_id,))
                    if await cur.fetchone() is None:
                        raise BonusCodeNotFoundError(data.site_id, f"configure_id={data.configure_id}")
                    configure_id: int = data.configure_id
                else:
                    await cur.execute(_RESOLVE_CODE_SQL, (data.site_id, data.code))
                    code_row = await cur.fetchone()
                    if code_row is None:
                        raise BonusCodeNotFoundError(data.site_id, data.code)
                    configure_id = code_row[0]

                await cur.execute(_EXISTS_TRIGGER_SQL, (configure_id, data.trigger_type))
                if await cur.fetchone():
                    raise BonusReleaseTriggerDuplicateError(configure_id, data.trigger_type)

                cfg_json = json.dumps(data.trigger_config) if data.trigger_config is not None else None
                row_hash = _hash_fields(configure_id, data.site_id, data, data.created_by)

                await cur.execute(
                    _INSERT_SQL,
                    (
                        configure_id, data.site_id, data.trigger_type, cfg_json,
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
    """Return a single bonus_release_trigger row by id."""
    log.info("get_bonus_release_trigger.start", trigger_id=trigger_id)

    try:
        async with get_connection(POOL_BONUS) as conn:
            await conn.commit()
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


async def delete_bonus_release_trigger(trigger_id: int) -> None:
    """Hard-delete a bonus_release_trigger row by id."""
    log.info("delete_bonus_release_trigger.start", trigger_id=trigger_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (trigger_id,))
                if await cur.fetchone() is None:
                    raise BonusReleaseTriggerNotFoundError(trigger_id)
                await cur.execute(_DELETE_SQL, (trigger_id,))
                await conn.commit()
    except BonusReleaseTriggerNotFoundError:
        raise
    except Exception as exc:
        log.error("delete_bonus_release_trigger.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc
    log.info("delete_bonus_release_trigger.done", trigger_id=trigger_id)


async def update_bonus_release_trigger(
    trigger_id: int, data: BonusReleaseTriggerUpdate
) -> BonusReleaseTriggerResponse:
    """Partial update of a bonus_release_trigger row."""
    updates: dict[str, object] = {}
    for field, col in _PATCHABLE.items():
        if field not in data.model_fields_set:
            continue
        val = getattr(data, field)
        if field == "active" and val is not None:
            updates[col] = int(val)
        elif field == "trigger_config":
            updates[col] = json.dumps(val) if val is not None else None
        else:
            updates[col] = val
    updates["updated_by"] = data.updated_by

    log.info("update_bonus_release_trigger.start", trigger_id=trigger_id, fields=list(updates))

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (trigger_id,))
                row = await cur.fetchone()
                if row is None:
                    raise BonusReleaseTriggerNotFoundError(trigger_id)

                configure_id_row: int = row[1]
                site_id: int = row[2]

                new_cfg_raw = updates.get("trigger_config", row[4])
                if isinstance(new_cfg_raw, str):
                    try:
                        new_cfg_parsed = json.loads(new_cfg_raw)
                    except Exception:
                        new_cfg_parsed = None
                else:
                    new_cfg_parsed = new_cfg_raw

                hash_fields: dict = {
                    "configure_id":   configure_id_row,
                    "site_id":        site_id,
                    "trigger_type":   updates.get("trigger_type", row[3]),
                    "trigger_config": json.dumps(new_cfg_parsed, sort_keys=True) if new_cfg_parsed else None,
                    "active":         updates.get("active", int(row[5])),
                    "created_by":     row[6],
                    "updated_by":     data.updated_by,
                }
                updates["row_hash"] = _compute_row_hash(hash_fields)

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
