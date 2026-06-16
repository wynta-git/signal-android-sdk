import json

from fastapi import HTTPException
from pydantic import BaseModel
from redis.asyncio import Redis

from shared.clients.mysql import get_connection
from shared.clients.redis import get_str, set_with_ttl

_CLIENT_VALIDATION_TTL = 300  # 5 minutes — matches token cache TTL

_SQL_CLIENT = """
    SELECT sc.id, sc.site_id, sc.client_id, sc.name, sc.description, sc.client_type, sc.active,
           s.name        AS site_name,
           p.id          AS project_id,
           p.name        AS project_name,
           p.project_key AS project_key
    FROM site_client sc
    JOIN site s ON s.id = sc.site_id
    LEFT JOIN project p ON p.id = s.program_id
    WHERE sc.client_id = %s
      AND sc.active = 1
"""

_SQL_CLIENTS_BY_SITE = """
    SELECT sc.id, sc.site_id, sc.client_id, sc.name, sc.description, sc.client_type, sc.active,
           s.name        AS site_name,
           p.id          AS project_id,
           p.name        AS project_name,
           p.project_key AS project_key
    FROM site_client sc
    JOIN site s ON s.id = sc.site_id
    LEFT JOIN project p ON p.id = s.program_id
    WHERE sc.site_id = %s
      AND sc.active = 1
    ORDER BY sc.id
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

_SQL_VALIDATE_CLIENT = """
    SELECT sc.id, sc.client_id, sc.client_secret, sc.site_id, s.program_id
    FROM site_client sc
    JOIN site s ON s.id = sc.site_id
    WHERE sc.client_id = %s
      AND sc.active = 1
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
    site_name: str | None
    project_id: int | None
    project_name: str | None
    project_key: str | None


class ClientValidationResult(BaseModel):
    client_id: str
    site_id: int
    program_id: int | None


def _cache_key(client_id: str) -> str:
    return f"auth:client:{client_id}"


def _validation_cache_key(client_id: str) -> str:
    return f"auth:client:val:{client_id}"


def _site_clients_cache_key(site_id: int) -> str:
    return f"auth:clients:site:{site_id}"


async def get_client_details(client_id: str, redis: Redis, ttl: int) -> ClientResponse:
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
        site_name=row[7],
        project_id=row[8],
        project_name=row[9],
        project_key=row[10],
    )

    await set_with_ttl(redis, key, client.model_dump_json(), ttl)
    return client


async def validate_client(
    client_id: str,
    client_secret: str,
    redis: Redis,
    ttl: int = _CLIENT_VALIDATION_TTL,
) -> ClientValidationResult:
    """Verify client_id + client_secret. Returns slim result from Redis cache when available.

    Cache stores the bcrypt hash so secret verification never requires a DB round-trip.
    Raises 401 uniformly — never reveals whether the client_id exists.
    """
    if not client_secret or not (8 <= len(client_secret) <= 256) or not client_secret.isprintable():
        raise HTTPException(status_code=401, detail="Invalid credentials")

    key = _validation_cache_key(client_id)

    cached = await get_str(redis, key)
    if cached:
        data = json.loads(cached)
        stored_secret: str = data.pop("_h")
        if client_secret != stored_secret:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return ClientValidationResult.model_validate(data)

    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_VALIDATE_CLIENT, (client_id,))
            row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _, cid, stored_secret, site_id, program_id = row

    if client_secret != stored_secret:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    result = ClientValidationResult(client_id=cid, site_id=site_id, program_id=program_id)
    payload = {**result.model_dump(), "_h": stored_secret}
    await set_with_ttl(redis, key, json.dumps(payload), ttl)

    return result


async def get_clients_by_site(site_id: int, redis: Redis, ttl: int) -> list[ClientResponse]:
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
                    site_name=row[7],
                    project_id=row[8],
                    project_name=row[9],
                    project_key=row[10],
                ))

    await set_with_ttl(redis, key, json.dumps([c.model_dump() for c in clients]), ttl)
    return clients
