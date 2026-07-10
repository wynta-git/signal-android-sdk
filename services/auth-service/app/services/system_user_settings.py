import json

from shared.clients.mysql import POOL_COMMON, get_connection
from shared.clients.redis import get_str, set_with_ttl
from shared.services.system_user import SETTING_TYPE_UI, settings_cache_key

from app.cache import get_redis
from app.config import settings

_SQL = """
    SELECT config_key, config_value
    FROM system_user_setting
    WHERE system_user_id = %s
      AND type = %s
      AND active = 1
"""


async def get_ui_settings_for_user(system_user_id: int) -> dict[str, str]:
    redis = get_redis()
    key = settings_cache_key(system_user_id)

    cached = await get_str(redis, key)
    if cached:
        return dict(json.loads(cached))

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL, (system_user_id, SETTING_TYPE_UI))
            rows = await cur.fetchall()

    result = {row[0]: row[1] for row in rows}
    await set_with_ttl(redis, key, json.dumps(result), settings.redis_cache_ttl)
    return result
