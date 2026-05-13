from redis.asyncio import Redis
from redis.asyncio.connection import ConnectionPool


def make_redis_client(url: str, *, max_connections: int = 20) -> Redis:
    pool = ConnectionPool.from_url(url, max_connections=max_connections, decode_responses=True)
    return Redis(connection_pool=pool)


async def token_pipeline_fetch(
    redis: Redis,
    revoke_key: str,
    cache_key: str,
    bonus_key: str,
) -> tuple[bool, str | None, frozenset[str]]:
    """Single round-trip: revocation flag + token cache + bonus event types."""
    async with redis.pipeline(transaction=False) as pipe:
        pipe.exists(revoke_key)
        pipe.get(cache_key)
        pipe.smembers(bonus_key)
        revoked, raw, bonus_types = await pipe.execute()
    return bool(revoked), raw, frozenset(bonus_types)


async def set_with_ttl(redis: Redis, key: str, value: str, ttl: int) -> None:
    await redis.set(key, value, ex=ttl)


async def incr_with_expire(redis: Redis, key: str, ttl_seconds: int) -> int:
    """Single round-trip: INCR + EXPIRE. Returns the new counter value."""
    async with redis.pipeline(transaction=False) as pipe:
        pipe.incr(key)
        pipe.expire(key, ttl_seconds)
        results = await pipe.execute()
    return int(results[0])
