import clickhouse_connect
from clickhouse_connect.driver.asyncclient import AsyncClient


async def make_clickhouse_client(
    host: str,
    port: int,
    database: str,
    username: str = "default",
    password: str = "",
) -> AsyncClient:
    return await clickhouse_connect.get_async_client(
        host=host,
        port=port,
        database=database,
        username=username,
        password=password,
    )
