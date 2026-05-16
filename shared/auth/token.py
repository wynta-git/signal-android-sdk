import asyncio
import hashlib
import json
from dataclasses import dataclass
from typing import Literal

from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis
from shared.clients.mongo import find_active_token, touch_token_last_used
from shared.clients.redis import set_with_ttl

TOKEN_CACHE_TTL = 300  # 5 minutes per auth.md


class InvalidTokenError(Exception):
    """Token is missing, malformed, not found, or revoked.
    Details are intentionally opaque — callers must not distinguish these cases."""


@dataclass(frozen=True)
class TokenContext:
    project_id: str
    scope: list[str]
    env: Literal["live", "test"]

    def has_scope(self, required: str) -> bool:
        return required in self.scope or "admin" in self.scope


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def token_cache_key(token_hash: str) -> str:
    return f"pam:token:{token_hash}"


def token_revoke_key(token_hash: str) -> str:
    return f"pam:token:{token_hash}:revoked"


def _parse_env(token: str) -> Literal["live", "test"]:
    return "test" if token.startswith("pam_test_") else "live"


async def validate_token(
    token: str,
    revoked: bool,
    token_raw: str | None,
    redis: Redis,
    db: AsyncIOMotorDatabase,
) -> TokenContext:
    if revoked:
        raise InvalidTokenError()

    if token_raw:
        data = json.loads(token_raw)
        return TokenContext(**data)

    token_hash = hash_token(token)
    doc = await find_active_token(db, token_hash)
    if not doc:
        raise InvalidTokenError()

    ctx = TokenContext(
        project_id=doc["project_id"],
        scope=list(doc["scope"]),
        env=_parse_env(token),
    )

    await set_with_ttl(
        redis,
        token_cache_key(token_hash),
        json.dumps({"project_id": ctx.project_id, "scope": ctx.scope, "env": ctx.env}),
        TOKEN_CACHE_TTL,
    )

    asyncio.create_task(touch_token_last_used(db, token_hash))

    return ctx
