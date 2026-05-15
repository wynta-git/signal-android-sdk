from __future__ import annotations

import json
from datetime import datetime, timezone

import structlog
from redis.asyncio import Redis

from app.config import settings
from shared.clients.mysql import get_connection

log = structlog.get_logger(__name__)

_FETCH_SQL = """
    SELECT eligibility_key, eligibility_value, eligibility_value_type
    FROM bonus_eligibility
    WHERE configure_id = %s
      AND active = 1
"""


async def _fetch_from_mysql(configure_id: int) -> list[dict]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_FETCH_SQL, (configure_id,))
            rows = await cur.fetchall()
    return [{"key": r[0], "value": r[1], "value_type": r[2]} for r in rows]


async def get_eligibility_rules(redis: Redis, configure_id: int) -> list[dict]:
    cache_key = f"pam:bonus:eligibility:{configure_id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    rules = await _fetch_from_mysql(configure_id)
    await redis.set(cache_key, json.dumps(rules), ex=settings.trigger_cache_ttl)
    return rules


def _evaluate_key(key: str, value: str, props: dict) -> bool:
    if key == "player_registered_period":
        raw = props.get("registered_at")
        if not raw:
            log.warning("eligibility_missing_registered_at", required_key=key)
            return False
        try:
            reg = datetime.fromisoformat(str(raw))
        except (ValueError, TypeError):
            log.warning("eligibility_invalid_registered_at", raw=raw)
            return False
        now = datetime.now(tz=timezone.utc)
        if reg.tzinfo is None:
            reg = reg.replace(tzinfo=timezone.utc)
        if value == "CURRENT_MONTH":
            return reg.year == now.year and reg.month == now.month
        if value == "CURRENT_WEEK":
            return reg.date().isocalendar()[:2] == now.date().isocalendar()[:2]
        if value == "CURRENT_YEAR":
            return reg.year == now.year
        log.warning("eligibility_unknown_period_value", value=value)
        return False

    # Unknown keys pass through — forward-compatible
    log.warning("eligibility_unknown_key", key=key)
    return True


async def check_eligibility(redis: Redis, configure_id: int, props: dict) -> bool:
    """
    Return True if the player satisfies all active eligibility rules for configure_id.

    No active rules → always passes (open bonus).
    All rows for the same configure_id are ANDed — every one must pass.
    """
    rules = await get_eligibility_rules(redis, configure_id)
    if not rules:
        return True

    return all(_evaluate_key(r["key"], r["value"], props) for r in rules)
