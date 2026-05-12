from redis.asyncio import Redis
from redis.asyncio.connection import ConnectionPool


def make_redis_client(url: str, *, max_connections: int = 20) -> Redis:
    pool = ConnectionPool.from_url(url, max_connections=max_connections, decode_responses=True)
    return Redis(connection_pool=pool)
