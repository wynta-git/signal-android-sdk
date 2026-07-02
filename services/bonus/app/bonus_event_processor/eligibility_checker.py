from __future__ import annotations

import json
from datetime import datetime, timezone

import httpx
import structlog
from redis.asyncio import Redis

from app.config import settings
from shared.clients.mysql import POOL_BONUS, POOL_COMMON, get_connection

log = structlog.get_logger(__name__)

_FETCH_SQL = """
    SELECT eligibility_key, eligibility_value, eligibility_value_type
    FROM bonus_eligibility
    WHERE configure_id = %s
      AND active = 1
"""

_SQL_SYSTEM_CLIENT = """
    SELECT client_id, client_secret
    FROM site_client
    WHERE site_id = %s
      AND client_type = 'SYSTEM'
      AND active = 1
    LIMIT 1
"""


async def _fetch_from_mysql(configure_id: int) -> list[dict]:
    async with get_connection(POOL_BONUS) as conn:
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


async def _get_system_token(site_id: int, redis: Redis) -> str | None:
    """Return a cached system token for site_id, fetching a new one when the cache is cold."""
    cache_key = f"pam:bonus:sys_token:{site_id}"
    cached = await redis.get(cache_key)
    if cached:
        return cached.decode() if isinstance(cached, bytes) else cached

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_SYSTEM_CLIENT, (site_id,))
            row = await cur.fetchone()

    if not row:
        log.warning("segment_eligibility_no_system_client", site_id=site_id)
        return None

    client_id, client_secret = row

    try:
        async with httpx.AsyncClient() as http:
            resp = await http.post(
                f"{settings.auth_service_url}/api/v1/system/token",
                json={"username": client_id, "password": client_secret},
                timeout=5.0,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        log.warning("segment_eligibility_token_fetch_failed", site_id=site_id, error=str(exc))
        return None

    token: str | None = data.get("access_token")
    expires_in: int = int(data.get("expires_in", 3600))
    ttl = max(expires_in - 60, 0)

    if token and ttl > 0:
        await redis.set(cache_key, token, ex=ttl)

    return token


async def _evaluate_key(key: str, value: str, props: dict, redis: Redis) -> bool:
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

    elif key == "segment_id":
        site_id = props.get("site_id")
        user_id = props.get("user_id")
        if not site_id or not user_id:
            log.warning("segment_eligibility_missing_props", site_id=site_id, user_id=user_id)
            return False

        token = await _get_system_token(int(site_id), redis)
        if not token:
            return False

        params: dict = {}
        project_id = props.get("project_id")
        if project_id:
            params["project_id"] = str(project_id)

        try:
            async with httpx.AsyncClient() as http:
                resp = await http.get(
                    f"{settings.segmentation_service_url}/api/v1/segment/segments/{value}/members/{user_id}",
                    headers={"Authorization": f"Bearer {token}"},
                    params=params,
                    timeout=5.0,
                )
                if resp.status_code == 404:
                    return False
                resp.raise_for_status()
                data = resp.json()
                return bool(data.get("is_member", False))
        except Exception as exc:
            log.warning(
                "segment_eligibility_check_failed",
                segment_id=value,
                user_id=user_id,
                error=str(exc),
            )
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

    for r in rules:
        if not await _evaluate_key(r["key"], r["value"], props, redis):
            return False
    return True
