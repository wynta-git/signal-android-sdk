import json

from fastapi import HTTPException
from pydantic import BaseModel

from shared.clients.mysql import get_connection
from shared.clients.redis import get_str, set_with_ttl

from app.cache import get_redis
from app.config import settings

_SQL_CLIENT = """
    SELECT id, site_id, client_id, name, description, client_type, active
    FROM site_client
    WHERE client_id = %s
      AND active = 1
"""

_SQL_CLIENTS_BY_SITE = """
    SELECT id, site_id, client_id, name, description, client_type, active
    FROM site_client
    WHERE site_id = %s
      AND active = 1
    ORDER BY id
"""

_SQL_HOSTS = """
    SELECT host
    FROM site_client_allowed_host
    WHERE client_id = %s
      AND active = 1
"""

_SQL_CONFIG = """
    SELECT config_key, config_value
    FROM site_client_configure
    WHERE client_id = %s
      AND active = 1
"""


class ClientResponse(BaseModel):
    id: int
    site_id: int
    client_id: str
    name: str
    description: str | None
    client_type: str
    allowed_hosts: list[str]
    configuration: dict[str, str]


def _cache_key(client_id: str) -> str:
    return f"auth:client:{client_id}"

def _site_clients_cache_key(site_id: int) -> str:
    return f"auth:clients:site:{site_id}"


async def get_client_details(client_id: str) -> ClientResponse:
    redis = get_redis()
    key = _cache_key(client_id)

    cached = await get_str(redis, key)
    if cached:
        return ClientResponse.model_validate(json.loads(cached))

    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_CLIENT, (client_id,))
            row = await cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Client not found")

            internal_id = row[0]

            await cur.execute(_SQL_HOSTS, (internal_id,))
            host_rows = await cur.fetchall()

            await cur.execute(_SQL_CONFIG, (internal_id,))
            config_rows = await cur.fetchall()

    client = ClientResponse(
        id=row[0],
        site_id=row[1],
        client_id=row[2],
        name=row[3],
        description=row[4],
        client_type=row[5],
        allowed_hosts=[h[0] for h in host_rows],
        configuration={r[0]: r[1] for r in config_rows},
    )

    await set_with_ttl(redis, key, client.model_dump_json(), settings.redis_cache_ttl)
    return client


async def get_clients_by_site(site_id: int) -> list[ClientResponse]:
    redis = get_redis()
    key = _site_clients_cache_key(site_id)

    cached = await get_str(redis, key)
    if cached:
        return [ClientResponse.model_validate(row) for row in json.loads(cached)]

    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_CLIENTS_BY_SITE, (site_id,))
            client_rows = await cur.fetchall()

            clients: list[ClientResponse] = []
            for row in client_rows:
                internal_id = row[0]

                await cur.execute(_SQL_HOSTS, (internal_id,))
                host_rows = await cur.fetchall()

                await cur.execute(_SQL_CONFIG, (internal_id,))
                config_rows = await cur.fetchall()

                clients.append(ClientResponse(
                    id=row[0],
                    site_id=row[1],
                    client_id=row[2],
                    name=row[3],
                    description=row[4],
                    client_type=row[5],
                    allowed_hosts=[h[0] for h in host_rows],
                    configuration={r[0]: r[1] for r in config_rows},
                ))

    await set_with_ttl(redis, key, json.dumps([c.model_dump() for c in clients]), settings.redis_cache_ttl)
    return clients
