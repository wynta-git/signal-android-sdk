import json

from pydantic import BaseModel

from shared.clients.mysql import get_connection
from shared.clients.redis import get_str, set_with_ttl

from app.cache import get_redis
from app.config import settings

_SQL = """
    SELECT su.id, su.display_name, r.code
    FROM system_user su
    JOIN user_site_role usr ON usr.user_id = su.id
    JOIN role r             ON r.id = usr.role_id
    WHERE su.active  = 1
      AND usr.active = 1
      AND usr.site_id = %s
    ORDER BY su.id
"""


class UserResponse(BaseModel):
    id: int
    display_name: str
    role: str


def _cache_key(site_id: int) -> str:
    return f"auth:users:site:{site_id}"


async def get_users_by_site(site_id: int) -> list[UserResponse]:
    redis = get_redis()
    key = _cache_key(site_id)

    cached = await get_str(redis, key)
    if cached:
        return [UserResponse.model_validate(row) for row in json.loads(cached)]

    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL, (site_id,))
            rows = await cur.fetchall()

    users = [UserResponse(id=r[0], display_name=r[1], role=r[2]) for r in rows]
    await set_with_ttl(redis, key, json.dumps([u.model_dump() for u in users]), settings.redis_cache_ttl)
    return users
