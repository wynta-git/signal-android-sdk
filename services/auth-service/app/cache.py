from redis.asyncio import Redis

from shared.clients.redis import make_redis_client

from app.config import settings

_redis: Redis | None = None


def init_redis() -> None:
    global _redis
    _redis = make_redis_client(settings.redis_url)


def get_redis() -> Redis:
    if _redis is None:
        raise RuntimeError("Redis client is not initialised — call init_redis() at startup")
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
