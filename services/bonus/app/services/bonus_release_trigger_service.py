import json

import aiomysql
import structlog
from redis.asyncio import Redis

from shared.clients.mysql import POOL_BONUS, get_connection

from app.config import settings
from app.exceptions import (
    BonusCodeNotFoundError,
    BonusReleaseTriggerDuplicateError,
    BonusReleaseTriggerNotFoundError,
    BonusReleaseTriggerValidationError,
    DatabaseError,
)
from app.models.bonus_release_trigger import (
    BonusConfigureSummary,
    BonusReleaseTriggerCreate,
    BonusReleaseTriggerResponse,
    BonusReleaseTriggerUpdate,
    TriggerWithConfigResponse,
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
    "WHERE configure_id = %s AND trigger_type = %s AND release_type = %s LIMIT 1"
)

_INSERT_SQL = """
    INSERT INTO bonus_release_trigger
        (configure_id, site_id, trigger_type, release_type, trigger_config,
         active, created_by, updated_by, row_hash)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, configure_id, site_id, trigger_type, release_type, trigger_config,
           active, created_by, updated_by, created_at, updated_at
    FROM bonus_release_trigger
    WHERE id = %s
"""

_DELETE_SQL = "DELETE FROM bonus_release_trigger WHERE id = %s"

_SELECT_WITH_CONFIG_SQL = """
    SELECT
        brt.id,
        brt.configure_id,
        brt.site_id,
        brt.trigger_type,
        brt.release_type,
        CAST(brt.trigger_config->>'$.min_amount' AS DECIMAL(15,2)),
        CAST(brt.trigger_config->>'$.max_amount' AS DECIMAL(15,2)),
        brt.trigger_config->>'$.payment_method',
        brt.trigger_config->>'$.product',
        COALESCE(CAST(brt.trigger_config->>'$.occurrence' AS UNSIGNED), 0),
        brt.trigger_config,
        brt.active,
        bc.id,
        bc.subhead_id,
        bc.name,
        bc.description,
        bc.start_date,
        bc.end_date,
        bc.applicability_frequency,
        bc.wager_multiplier,
        bc.no_of_chunks,
        bc.release_bucket,
        bc.chunk_expiry_days,
        bc.bonus_expiry_days,
        bc.wager_chip_type,
        bc.credit_chip_type,
        bc.bonus_amount_fixed,
        bc.bonus_amount_percent,
        bc.bonus_amount_max,
        bc.cashback_bonus_amount_fixed,
        bc.cashback_bonus_amount_percent,
        bc.cashback_bonus_amount_max,
        bc.priority,
        bc.active,
        bs.head_id,
        bc.product_wager_multiplier
    FROM bonus_release_trigger brt
    JOIN bonus_configure bc ON bc.id = brt.configure_id
    JOIN bonus_subhead bs ON bs.id = bc.subhead_id
    WHERE brt.site_id = %s
    ORDER BY bc.priority ASC, brt.id ASC
"""

_CACHE_KEY_SITE_TRIGGERS = "pam:bonus:site_triggers:{site_id}"

# ---------------------------------------------------------------------------
# Patchable columns
# ---------------------------------------------------------------------------

_PATCHABLE: dict[str, str] = {
    "trigger_type":   "trigger_type",
    "release_type":   "release_type",
    "trigger_config": "trigger_config",
    "active":         "active",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_response(row: tuple) -> BonusReleaseTriggerResponse:
    # id[0] configure_id[1] site_id[2] trigger_type[3] release_type[4]
    # trigger_config[5] active[6] created_by[7] updated_by[8] created_at[9] updated_at[10]
    raw_cfg = row[5]
    if isinstance(raw_cfg, str):
        try:
            raw_cfg = json.loads(raw_cfg)
        except Exception:
            raw_cfg = None
    return BonusReleaseTriggerResponse(
        id=row[0], configure_id=row[1], site_id=row[2],
        trigger_type=row[3], release_type=row[4], trigger_config=raw_cfg,
        active=bool(row[6]),
        created_by=row[7], updated_by=row[8],
        created_at=_as_dt(row[9]), updated_at=_as_dt(row[10]),
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

                await cur.execute(_EXISTS_TRIGGER_SQL, (configure_id, data.trigger_type, data.release_type))
                if await cur.fetchone():
                    raise BonusReleaseTriggerDuplicateError(configure_id, data.trigger_type)

                cfg_json = json.dumps(data.trigger_config) if data.trigger_config is not None else None
                row_hash = _hash_fields(configure_id, data.site_id, data, data.created_by)

                await cur.execute(
                    _INSERT_SQL,
                    (
                        configure_id, data.site_id, data.trigger_type, data.release_type, cfg_json,
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
                    "release_type":   updates.get("release_type", row[4]),
                    "trigger_config": json.dumps(new_cfg_parsed, sort_keys=True) if new_cfg_parsed else None,
                    "active":         updates.get("active", int(row[6])),
                    "created_by":     row[7],
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


def _row_to_trigger_with_config(row: tuple) -> TriggerWithConfigResponse:
    # brt columns: id[0] configure_id[1] site_id[2] trigger_type[3] release_type[4]
    #              min_trigger_amount[5] max_trigger_amount[6] payment_method[7]
    #              product[8] occurrence[9] trigger_config[10] active[11]
    # bc columns:  id[12] subhead_id[13] name[14] description[15] start_date[16]
    #              end_date[17] applicability_frequency[18] wager_multiplier[19]
    #              no_of_chunks[20] release_bucket[21] chunk_expiry_days[22]
    #              bonus_expiry_days[23] wager_chip_type[24] credit_chip_type[25]
    #              bonus_amount_fixed[26] bonus_amount_percent[27] bonus_amount_max[28]
    #              cashback_bonus_amount_fixed[29] cashback_bonus_amount_percent[30]
    #              cashback_bonus_amount_max[31] priority[32] active[33]
    # bs columns:  head_id[34]
    # product_wager_multiplier[35]
    raw_cfg = row[10]
    if isinstance(raw_cfg, str):
        try:
            raw_cfg = json.loads(raw_cfg)
        except Exception:
            raw_cfg = None

    raw_pwm = row[35]
    if isinstance(raw_pwm, str):
        try:
            raw_pwm = json.loads(raw_pwm)
        except Exception:
            raw_pwm = None
    product_wager_multiplier = (
        {k: float(v) for k, v in raw_pwm.items()} if isinstance(raw_pwm, dict) else None
    )

    return TriggerWithConfigResponse(
        id=row[0],
        configure_id=row[1],
        site_id=row[2],
        trigger_type=row[3],
        release_type=row[4],
        min_trigger_amount=row[5],
        max_trigger_amount=row[6],
        payment_method=row[7],
        product=row[8],
        occurrence=row[9],
        trigger_config=raw_cfg,
        active=bool(row[11]),
        configure=BonusConfigureSummary(
            id=row[12],
            subhead_id=row[13],
            head_id=row[34],
            name=row[14],
            description=row[15],
            start_date=_as_dt(row[16]),
            end_date=_as_dt(row[17]),
            applicability_frequency=row[18],
            wager_multiplier=row[19],
            product_wager_multiplier=product_wager_multiplier,
            no_of_chunks=row[20],
            release_bucket=row[21],
            chunk_expiry_days=row[22],
            bonus_expiry_days=row[23],
            wager_chip_type=row[24],
            credit_chip_type=row[25],
            bonus_amount_fixed=row[26],
            bonus_amount_percent=row[27],
            bonus_amount_max=row[28],
            cashback_bonus_amount_fixed=row[29],
            cashback_bonus_amount_percent=row[30],
            cashback_bonus_amount_max=row[31],
            priority=row[32],
            active=bool(row[33]),
        ),
    )


async def get_triggers_with_config_by_site(
    redis: Redis,
    site_id: int,
) -> list[TriggerWithConfigResponse]:
    """Return all release triggers with their bonus configure for a site.

    Checks Redis first; on a miss fetches from DB, serialises, and caches
    with ``settings.trigger_cache_ttl`` seconds TTL.
    """
    cache_key = _CACHE_KEY_SITE_TRIGGERS.format(site_id=site_id)

    cached = await redis.get(cache_key)
    if cached:
        log.debug("get_triggers_with_config_by_site.cache_hit", site_id=site_id)
        raw: list[dict] = json.loads(cached)
        return [TriggerWithConfigResponse.model_validate(r) for r in raw]

    log.debug("get_triggers_with_config_by_site.cache_miss", site_id=site_id)

    try:
        async with get_connection(POOL_BONUS) as conn:
            await conn.commit()
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_WITH_CONFIG_SQL, (site_id,))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("get_triggers_with_config_by_site.db_error", site_id=site_id, error=str(exc))
        raise DatabaseError(str(exc)) from exc

    result = [_row_to_trigger_with_config(r) for r in rows]

    await redis.set(
        cache_key,
        json.dumps([r.model_dump(mode="json") for r in result]),
        ex=settings.trigger_cache_ttl,
    )
    log.debug("get_triggers_with_config_by_site.cached", site_id=site_id, count=len(result))
    return result
