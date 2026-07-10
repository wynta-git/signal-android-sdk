from dataclasses import dataclass
from typing import Any

import jwt
import structlog
from redis.asyncio import Redis

from shared.clients.mysql import POOL_COMMON, get_connection
from shared.clients.redis import get_str, set_with_ttl

log = structlog.get_logger()

EXTERNAL_JWT_ALGORITHM = "HS256"


class InvalidExternalTokenError(Exception):
    """JWT is missing, malformed, expired, has an invalid signature, or is missing required claims.
    Details are intentionally opaque — callers must not distinguish these cases."""


@dataclass(frozen=True)
class ExternalTokenContext:
    sub: str
    project_id: str


_CACHE_KEY_PREFIX = "pam:prog_key:"


async def _fetch_program_key(
    program_id: int,
    redis: Redis | None = None,
    ttl: int = 3600,
) -> str | None:
    cache_key = f"{_CACHE_KEY_PREFIX}{program_id}"
    if redis is not None:
        cached = await get_str(redis, cache_key)
        if cached is not None:
            return cached

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT program_key FROM program WHERE id = %s LIMIT 1",
                (program_id,),
            )
            row = await cur.fetchone()

    value = row[0] if row else None
    if value is not None and redis is not None:
        await set_with_ttl(redis, cache_key, value, ttl)
    return value


async def validate_external_jwt(
    token: str,
    secret_key: str,
    redis: Redis | None = None,
    program_key_cache_ttl: int = 3600,
) -> ExternalTokenContext:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            secret_key,
            algorithms=[EXTERNAL_JWT_ALGORITHM],
            options={"require": ["exp"]},
        )
    except jwt.PyJWTError:
        raise InvalidExternalTokenError()

    log.info(
        "external_jwt_payload",
        user_id=payload.get("user_id"),
        email=payload.get("email"),
        program_name=payload.get("program name"),
        program_id=payload.get("program id"),
        exp=payload.get("exp"),
    )

    # External token uses "user_id" and "program id" (integer) instead of "sub"/"project_id"
    sub = payload.get("user_id")
    raw_project_id = payload.get("program id")

    if not sub or not str(sub).strip():
        raise InvalidExternalTokenError()
    if raw_project_id is None:
        raise InvalidExternalTokenError()

    project_id = await _fetch_program_key(int(raw_project_id), redis=redis, ttl=program_key_cache_ttl)
    if project_id is None:
        log.warning("external_jwt_unmapped_program_id", program_id=raw_project_id)
        raise InvalidExternalTokenError()

    return ExternalTokenContext(sub=str(sub), project_id=project_id)
