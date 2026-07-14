import json

from fastapi import HTTPException
from pydantic import BaseModel
from redis.asyncio import Redis

from shared.clients.mysql import POOL_COMMON, get_connection
from shared.clients.redis import get_str, set_with_ttl

_CLIENT_VALIDATION_TTL = 300  # 5 minutes — matches token cache TTL
_SITE_CONFIG_TTL = 3600  # 1 hour — site config changes rarely
_CLIENT_SECRET_TTL = 300  # 5 minutes
_ALL_PROGRAMS_TTL = 3600  # 1 hour — program list changes rarely

_SQL_CLIENT = """
    SELECT sc.id, sc.site_id, sc.client_id, sc.name, sc.description, sc.client_type, sc.active,
           s.name        AS site_name,
           p.id          AS program_id,
           p.name        AS program_name,
           p.program_key AS program_key,
           sc.created_by,
           sc.created_at
    FROM site_client sc
    LEFT JOIN site s ON s.id = sc.site_id
    LEFT JOIN program p ON p.id = s.program_id
    WHERE sc.client_id = %s
      AND sc.active = 1
"""

_SQL_CLIENTS_BY_SITE = """
    SELECT sc.id, sc.site_id, sc.client_id, sc.name, sc.description, sc.client_type, sc.active,
           s.name        AS site_name,
           p.id          AS program_id,
           p.name        AS program_name,
           p.program_key AS program_key,
           sc.created_by,
           sc.created_at
    FROM site_client sc
    LEFT JOIN site s ON s.id = sc.site_id
    LEFT JOIN program p ON p.id = s.program_id
    WHERE sc.site_id = %s
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
    SELECT sc.id, sc.client_id, sc.client_secret, sc.site_id, s.program_id,
           s.name AS site_name, p.name AS program_name, p.program_key AS program_key
    FROM site_client sc
    JOIN site s ON s.id = sc.site_id
    LEFT JOIN program p ON p.id = s.program_id
    WHERE sc.client_id = %s
      AND sc.active = 1
"""

_SQL_SITE_CONFIG = """
    SELECT s.program_id, p.program_key, cfg.config_key, cfg.config_value
    FROM site s
    LEFT JOIN program p ON p.id = s.program_id
    LEFT JOIN site_configure cfg ON cfg.site_id = s.id AND cfg.active = 1
    WHERE s.id = %s
      AND s.active = 1
"""

_SQL_CLIENT_SECRET = """
    SELECT client_secret
    FROM site_client
    WHERE client_id = %s
      AND active = 1
    LIMIT 1
"""

_SQL_ALL_PROGRAMS = """
    SELECT id, name, program_key
    FROM program
    WHERE active = 1
    ORDER BY id
"""


class ProgramResponse(BaseModel):
    id: int
    name: str
    program_key: str


class ClientResponse(BaseModel):
    id: int
    site_id: int
    client_id: str
    name: str
    description: str | None
    client_type: str
    active: int
    allowed_hosts: list[str]
    configuration: dict[str, str]
    site_name: str | None
    program_id: int | None
    program_name: str | None
    program_key: str | None
    created_by: str | None = None
    created_at: str | None = None


class ClientValidationResult(BaseModel):
    client_id: str
    site_id: int
    site_name: str | None
    program_id: int | None
    program_name: str | None
    program_key: str | None


class SiteConfig(BaseModel):
    site_id: int
    program_id: int | None  # site.program_id
    program_key: str | None = None  # program.program_key
    configuration: dict[str, str]  # all active site_configure rows


def _cache_key(client_id: str) -> str:
    return f"auth:client:v2:{client_id}"


def _validation_cache_key(client_id: str) -> str:
    return f"auth:client:val:v2:{client_id}"


def _site_clients_cache_key(site_id: int) -> str:
    return f"auth:clients:site:v2:{site_id}"


def _site_config_cache_key(site_id: int) -> str:
    return f"pam:site_config:v3:{site_id}"


def _all_programs_cache_key() -> str:
    return "pam:programs:all"


async def get_client_details(client_id: str, redis: Redis, ttl: int) -> ClientResponse:
    key = _cache_key(client_id)

    cached = await get_str(redis, key)
    if cached:
        return ClientResponse.model_validate(json.loads(cached))

    async with get_connection(POOL_COMMON) as conn:
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
        active=row[6],
        allowed_hosts=[h[0] for h in host_rows],
        configuration={r[0]: r[1] for r in config_rows},
        site_name=row[7],
        program_id=row[8],
        program_name=row[9],
        program_key=row[10],
        created_by=row[11],
        created_at=str(row[12]) if row[12] is not None else None,
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

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_VALIDATE_CLIENT, (client_id,))
            row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _, cid, stored_secret, site_id, program_id, site_name, program_name, program_key = row

    if client_secret != stored_secret:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    result = ClientValidationResult(
        client_id=cid,
        site_id=site_id,
        site_name=site_name,
        program_id=program_id,
        program_name=program_name,
        program_key=program_key,
    )
    payload = {**result.model_dump(), "_h": stored_secret}
    await set_with_ttl(redis, key, json.dumps(payload), ttl)

    return result


async def get_clients_by_site(site_id: int, redis: Redis, ttl: int) -> list[ClientResponse]:
    key = _site_clients_cache_key(site_id)

    cached = await get_str(redis, key)
    if cached:
        rows = json.loads(cached)
        if len(rows) > 0:
            return [ClientResponse.model_validate(row) for row in rows]

    async with get_connection(POOL_COMMON) as conn:
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
                    active=row[6],
                    allowed_hosts=[h[0] for h in host_rows],
                    configuration={r[0]: r[1] for r in config_rows},
                    site_name=row[7],
                    program_id=row[8],
                    program_name=row[9],
                    program_key=row[10],
                    created_by=row[11],
                    created_at=str(row[12]) if row[12] is not None else None,
                ))

    if len(clients) > 0:
        await set_with_ttl(redis, key, json.dumps([c.model_dump() for c in clients]), ttl)
    return clients


async def get_site_config(
    site_id: int,
    redis: Redis,
    ttl: int = _SITE_CONFIG_TTL,
) -> SiteConfig | None:
    """Return site config (program_id + all site_configure rows) for site_id.

    Cached in Redis at pam:site_config:{site_id} for `ttl` seconds.
    Returns None if the site does not exist or is inactive.
    """
    key = _site_config_cache_key(site_id)

    cached = await get_str(redis, key)
    if cached:
        return SiteConfig.model_validate(json.loads(cached))

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_SITE_CONFIG, (site_id,))
            rows = await cur.fetchall()

    if not rows:
        return None

    program_id = rows[0][0]  # site.program_id — same for every row
    program_key = rows[0][1]  # program.program_key — same for every row
    configuration = {row[2]: row[3] for row in rows if row[2] is not None}

    config = SiteConfig(
        site_id=site_id,
        program_id=program_id,
        program_key=program_key,
        configuration=configuration,
    )
    await set_with_ttl(redis, key, config.model_dump_json(), ttl)
    return config


_SQL_CLIENT_SITE_ID = (
    "SELECT site_id FROM site_client WHERE client_id = %s AND active = 1 LIMIT 1"
)


async def get_client_site_id(client_id: str, redis: Redis) -> int | None:
    """Return site_id for an active client_id. Redis-cached for 300 s."""
    key = f"auth:client:site:{client_id}"
    cached = await get_str(redis, key)
    if cached is not None:
        return int(cached)
    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_CLIENT_SITE_ID, (client_id,))
            row = await cur.fetchone()
    if row is None:
        return None
    await set_with_ttl(redis, key, str(row[0]), 300)
    return int(row[0])


async def get_client_secret(
    client_id: str,
    redis: Redis,
    ttl: int = _CLIENT_SECRET_TTL,
) -> str | None:
    """Return the client_secret for an active client_id.

    Checks Redis first; falls back to DB and caches the result.
    Returns None when the client does not exist or is inactive.
    """
    key = f"auth:client:secret:{client_id}"

    cached = await get_str(redis, key)
    if cached is not None:
        return cached

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_CLIENT_SECRET, (client_id,))
            row = await cur.fetchone()

    if not row:
        return None

    secret: str = row[0]
    await set_with_ttl(redis, key, secret, ttl)
    return secret


async def get_all_programs(
    redis: Redis,
    ttl: int = _ALL_PROGRAMS_TTL,
) -> list[ProgramResponse]:
    """Return all active programs.

    Cached in Redis at pam:programs:all for `ttl` seconds.
    """
    key = _all_programs_cache_key()

    cached = await get_str(redis, key)
    if cached:
        return [ProgramResponse.model_validate(row) for row in json.loads(cached)]

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_ALL_PROGRAMS)
            rows = await cur.fetchall()

    programs = [ProgramResponse(id=row[0], name=row[1], program_key=row[2]) for row in rows]

    await set_with_ttl(redis, key, json.dumps([p.model_dump() for p in programs]), ttl)
    return programs


_PROGRAM_ID_BY_KEY_TTL = 3600  # 1 hour
_ACTIVE_SITES_BY_PROGRAM_TTL = 3600  # 1 hour

_SQL_PROGRAM_ID_BY_KEY = "SELECT id FROM program WHERE program_key = %s AND active = 1 LIMIT 1"
_SQL_ACTIVE_SITE_IDS_BY_PROGRAM = "SELECT id FROM site WHERE program_id = %s AND active = 1"


def _program_id_by_key_cache_key(program_key: str) -> str:
    return f"pam:program:id_by_key:{program_key}"


def _active_sites_by_program_cache_key(program_id: int) -> str:
    return f"pam:site:by_program:{program_id}"


async def get_program_id_by_key(
    program_key: str,
    redis: Redis,
    ttl: int = _PROGRAM_ID_BY_KEY_TTL,
) -> int | None:
    """Return program.id for an active program_key, or None if unmapped."""
    key = _program_id_by_key_cache_key(program_key)

    cached = await get_str(redis, key)
    if cached is not None:
        return int(cached)

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_PROGRAM_ID_BY_KEY, (program_key,))
            row = await cur.fetchone()

    if row is None:
        return None

    await set_with_ttl(redis, key, str(row[0]), ttl)
    return int(row[0])


async def get_active_site_ids_by_program(
    program_id: int,
    redis: Redis,
    ttl: int = _ACTIVE_SITES_BY_PROGRAM_TTL,
) -> list[int]:
    """Return the ids of every active site under program_id."""
    key = _active_sites_by_program_cache_key(program_id)

    cached = await get_str(redis, key)
    if cached is not None:
        return [int(v) for v in json.loads(cached)]

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_ACTIVE_SITE_IDS_BY_PROGRAM, (program_id,))
            rows = await cur.fetchall()

    site_ids = [int(row[0]) for row in rows]

    await set_with_ttl(redis, key, json.dumps(site_ids), ttl)
    return site_ids
