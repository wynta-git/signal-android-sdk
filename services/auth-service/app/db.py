from shared.clients.mysql import close_pool
from shared.clients.mysql import init_pool as _init_pool

from app.config import settings

__all__ = ["init_pool", "close_pool"]


async def init_pool() -> None:
    await _init_pool(
        "wynta_common",
        host=settings.common_db_host,
        port=settings.common_db_port,
        user=settings.common_db_user,
        password=settings.common_db_password,
        db=settings.common_db_name,
        minsize=settings.common_db_pool_minsize,
        maxsize=settings.common_db_pool_maxsize,
    )
