from shared.clients.mysql import close_pool
from shared.clients.mysql import init_pool as _init_pool

from app.config import settings

__all__ = ["init_pool", "close_pool"]


async def init_pool() -> None:
    await _init_pool(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        db=settings.db_name,
        minsize=settings.db_pool_minsize,
        maxsize=settings.db_pool_maxsize,
    )
