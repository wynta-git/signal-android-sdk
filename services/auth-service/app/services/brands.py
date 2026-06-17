import json

from pydantic import BaseModel

from shared.clients.mysql import get_connection
from shared.clients.redis import get_str, set_with_ttl

from app.cache import get_redis
from app.config import settings

_CACHE_KEY = "auth:brands:program:{program_id}"

_SQL = """
    SELECT id, name, COALESCE(description, '')
    FROM site
    WHERE active = 1 AND program_id = %s
    ORDER BY id
"""


class BrandResponse(BaseModel):
    site_id: int
    name: str
    description: str


async def get_active_brands(program_id: int) -> list[BrandResponse]:
    redis = get_redis()
    cache_key = _CACHE_KEY.format(program_id=program_id)

    cached = await get_str(redis, cache_key)
    if cached:
        return [BrandResponse.model_validate(row) for row in json.loads(cached)]

    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL, (program_id,))
            rows = await cur.fetchall()

    brands = [BrandResponse(site_id=r[0], name=r[1], description=r[2]) for r in rows]
    await set_with_ttl(redis, cache_key, json.dumps([b.model_dump() for b in brands]), settings.redis_cache_ttl)
    return brands
