import json

import structlog
from redis.asyncio import Redis

from shared.clients.mysql import POOL_COMMON, get_connection
from shared.clients.redis import get_str, set_with_ttl

log = structlog.get_logger(__name__)

_PAM_USER_TTL = 3600  # 1 hour — user-site mappings rarely change

_SQL_GET = """
    SELECT id
    FROM pam_user_mapping
    WHERE site_id = %s AND user_id = %s
    LIMIT 1
"""

_SQL_INSERT = """
    INSERT INTO pam_user_mapping (site_id, user_id)
    VALUES (%s, %s)
"""


def _cache_key(site_id: int, user_id: str) -> str:
    return f"pam:user:{site_id}:{user_id}"


async def get_pam_user_id(
    redis: Redis,
    site_id: int,
    user_id: str,
    ttl: int = _PAM_USER_TTL,
) -> int | None:
    """Return the pam_user_mapping.id for (site_id, user_id), or None if not found.

    Checks Redis first; falls back to DB and caches the result.
    """
    key = _cache_key(site_id, user_id)

    cached = await get_str(redis, key)
    if cached is not None:
        log.debug("get_pam_user_id.cache_hit", site_id=site_id, user_id=user_id)
        return int(cached)

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_GET, (site_id, user_id))
            row = await cur.fetchone()

    if row is None:
        log.debug("get_pam_user_id.not_found", site_id=site_id, user_id=user_id)
        return None

    pam_id: int = row[0]
    await set_with_ttl(redis, key, str(pam_id), ttl)
    log.debug("get_pam_user_id.cached", site_id=site_id, user_id=user_id, pam_id=pam_id)
    return pam_id


async def get_or_create_pam_user(
    redis: Redis,
    site_id: int,
    user_id: str,
    ttl: int = _PAM_USER_TTL,
) -> int:
    """Return the pam_user_mapping.id for (site_id, user_id), inserting a new row if absent.

    The result is always cached in Redis so subsequent calls are served from cache.
    """
    key = _cache_key(site_id, user_id)

    cached = await get_str(redis, key)
    if cached is not None:
        log.debug("get_or_create_pam_user.cache_hit", site_id=site_id, user_id=user_id)
        return int(cached)

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_GET, (site_id, user_id))
            row = await cur.fetchone()

            if row is not None:
                pam_id: int = row[0]
                log.debug("get_or_create_pam_user.found", site_id=site_id, user_id=user_id, pam_id=pam_id)
            else:
                await cur.execute(_SQL_INSERT, (site_id, user_id))
                pam_id = cur.lastrowid  # type: ignore[assignment]
                await conn.commit()
                log.info("get_or_create_pam_user.created", site_id=site_id, user_id=user_id, pam_id=pam_id)

    await set_with_ttl(redis, key, str(pam_id), ttl)
    return pam_id
