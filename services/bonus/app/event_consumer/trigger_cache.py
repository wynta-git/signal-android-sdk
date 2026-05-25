from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import structlog
from redis.asyncio import Redis

from app.config import settings
from shared.clients.mysql import get_connection

log = structlog.get_logger(__name__)

_FETCH_SQL = """
    SELECT
        brt.id,
        brt.configure_id,
        brt.min_trigger_amount,
        brt.max_trigger_amount,
        brt.payment_method,
        brt.product,
        brt.occurrence,
        bc.id,
        bc.subhead_id,
        bc.start_date,
        bc.end_date,
        bc.applicability_frequency,
        bc.wager_multiplier,
        bc.no_of_chunks,
        bc.chunk_expiry_days,
        bc.bonus_expiry_days,
        bc.wager_chip_type,
        bc.credit_chip_type,
        bc.bonus_amount_fixed,
        bc.bonus_amount_percent,
        bc.bonus_amount_max,
        bc.priority,
        bs.head_id
    FROM bonus_release_trigger brt
    JOIN bonus_configure bc ON bc.id = brt.configure_id
    JOIN bonus_subhead   bs ON bs.id = bc.subhead_id
    WHERE brt.site_id = %s
      AND brt.trigger_type = %s
      AND brt.active = 1
      AND bc.active = 1
      AND bc.start_date <= NOW()
      AND bc.end_date   >= NOW()
    ORDER BY bc.priority ASC
"""


def _serialize(value: object) -> object:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _row_to_dict(row: tuple) -> dict:
    return {
        "trigger_id": row[0],
        "configure_id": row[1],
        "min_trigger_amount": _serialize(row[2]),
        "max_trigger_amount": _serialize(row[3]),
        "payment_method": row[4],
        "product": row[5],
        "occurrence": row[6],
        "configure": {
            "id": row[7],
            "subhead_id": row[8],
            "start_date": _serialize(row[9]),
            "end_date": _serialize(row[10]),
            "applicability_frequency": row[11],
            "wager_multiplier": _serialize(row[12]),
            "no_of_chunks": row[13],
            "chunk_expiry_days": row[14],
            "bonus_expiry_days": row[15],
            "wager_chip_type": row[16],
            "credit_chip_type": row[17],
            "bonus_amount_fixed": _serialize(row[18]),
            "bonus_amount_percent": _serialize(row[19]),
            "bonus_amount_max": _serialize(row[20]),
            "priority": row[21],
            "head_id": row[22],
        },
    }


async def _fetch_from_mysql(site_id: int, trigger_type: str) -> list[dict]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_FETCH_SQL, (site_id, trigger_type))
            rows = await cur.fetchall()
    return [_row_to_dict(r) for r in rows]


async def get_triggers(redis: Redis, site_id: int, trigger_type: str) -> list[dict]:
    key = f"pam:bonus:triggers:{site_id}:{trigger_type}"
    cached = await redis.get(key)
    if cached:
        log.debug("trigger_cache_hit", site_id=site_id, trigger_type=trigger_type)
        return json.loads(cached)

    log.debug("trigger_cache_miss", site_id=site_id, trigger_type=trigger_type)
    rows = await _fetch_from_mysql(site_id, trigger_type)
    await redis.set(key, json.dumps(rows), ex=settings.trigger_cache_ttl)
    return rows
