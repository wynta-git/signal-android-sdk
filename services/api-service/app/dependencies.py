from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.token import (
    InvalidTokenError,
    TokenContext,
    hash_token,
    token_cache_key,
    token_revoke_key,
    validate_token,
)
from app.config import settings
from app.kafka_producer import KafkaEventProducer
from shared.clients.redis import get_lookup

log = structlog.get_logger()

_bearer = HTTPBearer(auto_error=False)

BONUS_TYPES_KEY = "pam:bonus_event_types"


async def get_token_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> TokenContext:
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Missing or malformed Authorization header"},
        )

    token = credentials.credentials
    token_hash = hash_token(token)
    redis = request.app.state.redis

    lookup = await get_lookup(
        redis,
        token_revoke_key(token_hash),
        token_cache_key(token_hash),
        BONUS_TYPES_KEY,
    )

    try:
        ctx = await validate_token(
            token,
            lookup["revoked"],
            lookup["token_raw"],
            redis,
            request.app.state.mongo[settings.mongo_db],
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired token"},
        )

    request.state.bonus_types = lookup["bonus_types"]
    structlog.contextvars.bind_contextvars(project_id=ctx.project_id, env=ctx.env)
    return ctx


class RequireScope:
    """Reusable FastAPI dependency that validates token scope after auth."""

    def __init__(self, scope: str) -> None:
        self.scope = scope

    async def __call__(self, ctx: TokenContext = Depends(get_token_context)) -> TokenContext:
        if not ctx.has_scope(self.scope):
            raise HTTPException(
                status_code=403,
                detail={"code": "forbidden", "message": "Token scope insufficient"},
            )
        return ctx


def get_producer(request: Request) -> KafkaEventProducer:
    return request.app.state.producer


def get_bonus_producer(request: Request) -> KafkaEventProducer:
    return request.app.state.bonus_producer


# Pre-built type aliases — use these in route signatures for clean one-liners:
#   async def track(ctx: EventsWriteDep, ...):
EventsWriteDep = Annotated[TokenContext, Depends(RequireScope("events:write"))]
AdminDep = Annotated[TokenContext, Depends(RequireScope("admin"))]
BonusProducerDep = Annotated[KafkaEventProducer, Depends(get_bonus_producer)]
