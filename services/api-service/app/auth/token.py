import asyncio
import hashlib
import json
from dataclasses import dataclass
from typing import Literal

from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis
from shared.clients.mongo import find_active_token, touch_token_last_used
from shared.clients.redis import set_with_ttl, token_pipeline_fetch

TOKEN_CACHE_TTL = 300  # 5 minutes per auth.md
BONUS_TYPES_KEY = "pam:bonus_event_types"


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


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _cache_key(token_hash: str) -> str:
    return f"pam:token:{token_hash}"


def _revoke_key(token_hash: str) -> str:
    return f"pam:token:{token_hash}:revoked"


def _parse_env(token: str) -> Literal["live", "test"]:
    return "test" if token.startswith("pam_test_") else "live"


async def validate_token(
    token: str,
    redis: Redis,
    db: AsyncIOMotorDatabase,
) -> tuple[TokenContext, frozenset[str]]:
    token_hash = _hash(token)

    revoked, raw, bonus_types = await token_pipeline_fetch(
        redis, _revoke_key(token_hash), _cache_key(token_hash), BONUS_TYPES_KEY
    )

    if revoked:
        raise InvalidTokenError()

    # Cache hit — happy path, no DB roundtrip
    if raw:
        data = json.loads(raw)
        return TokenContext(**data), bonus_types

    # Cache miss — query MongoDB
    doc = await find_active_token(db, token_hash)
    if not doc:
        raise InvalidTokenError()

    ctx = TokenContext(
        project_id=doc["project_id"],
        scope=list(doc["scope"]),
        env=_parse_env(token),
    )

    # Populate cache before returning so concurrent requests skip the DB roundtrip
    await set_with_ttl(
        redis,
        _cache_key(token_hash),
        json.dumps({"project_id": ctx.project_id, "scope": ctx.scope, "env": ctx.env}),
        TOKEN_CACHE_TTL,
    )

    # Non-blocking audit write — a lost update here is acceptable
    asyncio.create_task(touch_token_last_used(db, token_hash))

    return ctx, bonus_types
