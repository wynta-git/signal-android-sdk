import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import structlog
from redis.asyncio import Redis

from shared.clients.mysql import POOL_COMMON, get_connection
from shared.clients.redis import get_str, set_with_ttl

if TYPE_CHECKING:
    from motor.motor_asyncio import AsyncIOMotorDatabase

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

_SQL_GET_EXTERNAL_USER_ID = """
    SELECT user_id
    FROM pam_user_mapping
    WHERE id = %s
    LIMIT 1
"""


def _cache_key(site_id: int, user_id: str) -> str:
    return f"pam:user:{site_id}:{user_id}"


def _reverse_cache_key(pam_user_id: int) -> str:
    return f"pam:user:reverse:{pam_user_id}"


async def get_external_user_id(
    redis: Redis,
    pam_user_id: int,
    ttl: int = _PAM_USER_TTL,
) -> str | None:
    """Reverse lookup: pam_user_mapping.id -> the external user_id.

    Checks Redis first; falls back to DB and caches the result.
    """
    key = _reverse_cache_key(pam_user_id)

    cached = await get_str(redis, key)
    if cached is not None:
        log.debug("get_external_user_id.cache_hit", pam_user_id=pam_user_id)
        return cached

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_GET_EXTERNAL_USER_ID, (pam_user_id,))
            row = await cur.fetchone()

    if row is None:
        log.debug("get_external_user_id.not_found", pam_user_id=pam_user_id)
        return None

    user_id: str = row[0]
    await set_with_ttl(redis, key, user_id, ttl)
    log.debug("get_external_user_id.cached", pam_user_id=pam_user_id, user_id=user_id)
    return user_id


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


async def resolve_pam_id_from_brand(
    redis: Redis,
    brand_id: str | None,
    user_id: str,
) -> int | None:
    """Resolve pam_id given the `brand_id` stored on a Mongo user profile doc.

    `brand_id` is written by api-service as the string form of the MySQL
    site_id (see services/api-service/app/routes/identify.py). Returns None
    if brand_id is missing/non-numeric, or if no mapping exists yet — never
    raises, since callers use this for best-effort enrichment.
    """
    if not brand_id:
        return None
    try:
        site_id = int(brand_id)
    except (TypeError, ValueError):
        log.debug("resolve_pam_id_from_brand.non_numeric_brand_id", brand_id=brand_id)
        return None
    return await get_pam_user_id(redis, site_id, user_id)


async def get_or_create_pam_user(
    redis: Redis,
    site_id: int,
    user_id: str,
    ttl: int = _PAM_USER_TTL,
    mongo_db: "AsyncIOMotorDatabase | None" = None,
) -> int:
    """Return the pam_user_mapping.id for (site_id, user_id), inserting a new row if absent.

    The result is always cached in Redis so subsequent calls are served from cache.
    When `mongo_db` is given and a new mapping row is inserted, the user's Mongo
    profile is upserted with brand_id (= site_id) and the new pam_id (best-effort).
    """
    key = _cache_key(site_id, user_id)
    if mongo_db is not None :
        key = f"profile:{key}"

    cached = await get_str(redis, key)
    if cached is not None:
        log.debug("get_or_create_pam_user.cache_hit", site_id=site_id, user_id=user_id)
        return int(cached)

    created = False
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
                created = True
                log.info("get_or_create_pam_user.created", site_id=site_id, user_id=user_id, pam_id=pam_id)

    if cached is None and mongo_db is not None:
        await _upsert_new_user_profile(redis, mongo_db, site_id, user_id, pam_id)

    await set_with_ttl(redis, key, str(pam_id), ttl)
    return pam_id


async def _upsert_new_user_profile(
    redis: Redis,
    mongo_db: "AsyncIOMotorDatabase",
    site_id: int,
    user_id: str,
    pam_id: int,
) -> None:
    """Best-effort Mongo `users` profile upsert for a newly created pam user."""
    from shared.clients.mongo import upsert_user_profile
    from shared.services.client import get_site_config

    try:
        cfg = await get_site_config(site_id, redis)
        if cfg is None or not cfg.program_key:
            log.warning(
                "pam_user.profile_upsert_skipped_no_program_key",
                site_id=site_id, user_id=user_id,
            )
            return
        await upsert_user_profile(
            mongo_db,
            project_id=cfg.program_key,
            user_id=user_id,
            traits={},
            anonymous_id=None,
            unset_traits=[],
            now=datetime.now(timezone.utc),
            brand_id=site_id,  # stored as the numeric site_id (matches api-service identify)
            pam_id=pam_id,
        )
        log.info("pam_user.profile_upserted", site_id=site_id, user_id=user_id, pam_id=pam_id)
    except Exception as exc:
        log.warning(
            "pam_user.profile_upsert_failed",
            site_id=site_id, user_id=user_id, pam_id=pam_id, error=str(exc),
        )
