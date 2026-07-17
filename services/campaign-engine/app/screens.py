import json

from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from shared.clients.mongo import list_screen_catalog
from shared.clients.redis import get_str, set_with_ttl

_CACHE_TTL_SECONDS = 300


async def get_cached_screen_catalog(
    db: AsyncIOMotorDatabase,
    redis: Redis,
    project_id: str,
    brand_id: str | None = None,
) -> list[str]:
    brand_key = brand_id or "all"
    key = f"pam:screens:{project_id}:{brand_key}"

    cached = await get_str(redis, key)
    if cached is not None:
        return json.loads(cached)

    screens = await list_screen_catalog(db, project_id, brand_id)
    await set_with_ttl(redis, key, json.dumps(screens), _CACHE_TTL_SECONDS)
    return screens
