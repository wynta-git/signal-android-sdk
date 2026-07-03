import json
import secrets

from redis.asyncio import Redis

from shared.clients.mysql import POOL_COMMON, get_connection

_DEFAULT_ROLE = {
    "scopes": ["events", "users", "segments"],
    "permissions": ["read", "write", "admin"],
}

_SQL_INSERT_CLIENT = """
    INSERT INTO site_client
        (site_id, client_id, client_secret, name, description, active, client_type, role, created_by, updated_by)
    VALUES (%s, %s, %s, %s, %s, 1, %s, %s, %s, %s)
"""

_SQL_GET_SITE_ID = "SELECT site_id FROM site_client WHERE client_id = %s LIMIT 1"

_SQL_DELETE_CLIENT = "DELETE FROM site_client WHERE client_id = %s"

_CACHE_KEYS = [
    "auth:client:{cid}",
    "auth:client:val:{cid}",
    "auth:client:secret:{cid}",
    "auth:client:site:{cid}",
]


async def create_client(
    site_id: int,
    name: str,
    description: str | None,
    client_type: str,
    created_by: str,
    client_id: str | None = None,
    redis: Redis | None = None,
) -> tuple[str, dict]:
    client_id = client_id or f"cid_{secrets.token_urlsafe(16)}"
    raw_secret = secrets.token_urlsafe(16)

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                _SQL_INSERT_CLIENT,
                (
                    site_id,
                    client_id,
                    raw_secret,
                    name,
                    description or "",
                    client_type,
                    json.dumps(_DEFAULT_ROLE),
                    created_by,
                    created_by,
                ),
            )
        await conn.commit()

    if redis:
        await redis.delete(f"auth:clients:site:{site_id}")

    return raw_secret, {
        "client_id": client_id,
        "site_id": site_id,
        "name": name,
        "description": description,
        "client_type": client_type,
        "role": _DEFAULT_ROLE,
        "created_by": created_by,
    }


async def delete_client(client_id: str, redis: Redis | None) -> None:
    site_id: int | None = None

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_GET_SITE_ID, (client_id,))
            row = await cur.fetchone()
            if row:
                site_id = row[0]
            await cur.execute(_SQL_DELETE_CLIENT, (client_id,))
        await conn.commit()

    if redis:
        for pattern in _CACHE_KEYS:
            await redis.delete(pattern.format(cid=client_id))
        if site_id is not None:
            await redis.delete(f"auth:clients:site:{site_id}")
