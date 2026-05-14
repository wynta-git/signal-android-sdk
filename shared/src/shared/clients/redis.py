from collections.abc import Iterable
from typing import TypedDict

from redis.asyncio import Redis
from redis.asyncio.connection import ConnectionPool


def make_redis_client(url: str, *, max_connections: int = 20) -> Redis:
    pool = ConnectionPool.from_url(url, max_connections=max_connections, decode_responses=True)
    return Redis(connection_pool=pool)


class RedisLookup(TypedDict):
    revoked: bool
    token_raw: str | None
    bonus_types: frozenset[str]


async def get_lookup(
    redis: Redis,
    revoke_key: str,
    cache_key: str,
    bonus_key: str,
) -> RedisLookup:
    """Single pipeline round-trip. Returns raw data — callers route each field independently."""
    async with redis.pipeline(transaction=False) as pipe:
        pipe.exists(revoke_key)
        pipe.get(cache_key)
        pipe.smembers(bonus_key)
        revoked, raw, bonus_types = await pipe.execute()
    return RedisLookup(
        revoked=bool(revoked),
        token_raw=raw,
        bonus_types=frozenset(bonus_types),
    )


async def set_with_ttl(redis: Redis, key: str, value: str, ttl: int) -> None:
    await redis.set(key, value, ex=ttl)


async def incr_with_expire(redis: Redis, key: str, ttl_seconds: int) -> int:
    """Single round-trip: INCR + EXPIRE. Returns the new counter value."""
    async with redis.pipeline(transaction=False) as pipe:
        pipe.incr(key)
        pipe.expire(key, ttl_seconds)
        results = await pipe.execute()
    return int(results[0])


async def set_nx_ex(redis: Redis, key: str, value: str, ttl: int) -> bool:
    """SET key value NX EX ttl. Returns True if the key was newly set."""
    return bool(await redis.set(key, value, nx=True, ex=ttl))


async def delete_key(redis: Redis, key: str) -> None:
    await redis.delete(key)


async def key_exists(redis: Redis, key: str) -> bool:
    return bool(await redis.exists(key))


async def hget(redis: Redis, key: str, field: str) -> str | None:
    return await redis.hget(key, field)


async def hsetnx(redis: Redis, key: str, field: str, value: str) -> None:
    await redis.hsetnx(key, field, value)


async def hgetall(redis: Redis, key: str) -> dict[str, str]:
    return await redis.hgetall(key)


async def hmget(redis: Redis, key: str, fields: Iterable[str]) -> list[str | None]:
    return await redis.hmget(key, *fields)


async def pipeline_set_nx_ex(
    redis: Redis, keys: list[str], value: str, ttl: int
) -> list[bool]:
    """Pipeline SET NX EX for multiple keys. Returns True per key if newly set."""
    async with redis.pipeline(transaction=False) as pipe:
        for key in keys:
            pipe.set(key, value, nx=True, ex=ttl)
        results = await pipe.execute()
    return [bool(r) for r in results]


async def pipeline_hsetnx_multi(
    redis: Redis, key: str, field_value_pairs: dict[str, str]
) -> None:
    """Pipeline HSETNX for multiple fields on a single hash key."""
    async with redis.pipeline(transaction=False) as pipe:
        for field, value in field_value_pairs.items():
            pipe.hsetnx(key, field, value)
        await pipe.execute()


async def ping_redis(redis: Redis) -> None:
    await redis.ping()
