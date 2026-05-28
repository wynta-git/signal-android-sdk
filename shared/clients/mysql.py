from contextlib import asynccontextmanager
from typing import AsyncGenerator

import aiomysql

_pool: aiomysql.Pool | None = None


async def init_pool(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    db: str,
    minsize: int = 2,
    maxsize: int = 10,
) -> None:
    global _pool
    _pool = await aiomysql.create_pool(
        host=host,
        port=port,
        user=user,
        password=password,
        db=db,
        minsize=minsize,
        maxsize=maxsize,
        autocommit=False,
        charset="utf8mb4",
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


def get_pool() -> aiomysql.Pool:
    if _pool is None:
        raise RuntimeError("MySQL pool is not initialised — call init_pool() at startup")
    return _pool


@asynccontextmanager
async def get_connection() -> AsyncGenerator[aiomysql.Connection, None]:
    async with get_pool().acquire() as conn:
        yield conn
