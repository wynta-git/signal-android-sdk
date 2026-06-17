from contextlib import asynccontextmanager
from typing import AsyncGenerator

import aiomysql

_pools: dict[str, aiomysql.Pool] = {}

# Well-known pool names — services that use shared/ helpers must init these.
POOL_BONUS = "wynta_bonus"
POOL_COMMON = "wynta_common"


async def init_pool(
    name: str,
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    db: str,
    minsize: int = 2,
    maxsize: int = 10,
    pool_recycle: int = 280,
) -> None:
    _pools[name] = await aiomysql.create_pool(
        host=host,
        port=port,
        user=user,
        password=password,
        db=db,
        minsize=minsize,
        maxsize=maxsize,
        autocommit=False,
        charset="utf8mb4",
        # Idle connections to a remote DB get dropped by NAT/firewalls without
        # the server noticing; recycle before typical idle-timeout windows.
        pool_recycle=pool_recycle,
    )


async def close_pool(name: str | None = None) -> None:
    """Close a named pool, or all pools when name is None."""
    targets = [name] if name else list(_pools.keys())
    for n in targets:
        pool = _pools.pop(n, None)
        if pool is not None:
            pool.close()
            await pool.wait_closed()


def get_pool(name: str) -> aiomysql.Pool:
    pool = _pools.get(name)
    if pool is None:
        raise RuntimeError(f"MySQL pool '{name}' is not initialised — call init_pool('{name}') at startup")
    return pool


@asynccontextmanager
async def get_connection(name: str) -> AsyncGenerator[aiomysql.Connection, None]:
    async with get_pool(name).acquire() as conn:
        try:
            yield conn
        finally:
            # autocommit is off: end any transaction left open (e.g. reads after
            # the final commit) so the connection returns to the pool clean and
            # holds no stale snapshot or locks.
            await conn.rollback()
