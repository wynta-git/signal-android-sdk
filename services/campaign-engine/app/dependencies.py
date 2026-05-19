from typing import Annotated

import structlog
from aiokafka import AIOKafkaProducer
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from shared.auth.token import (
    InvalidTokenError,
    TokenContext,
    hash_token,
    token_cache_key,
    token_revoke_key,
    validate_token,
)
from shared.clients.redis import get_lookup

log = structlog.get_logger()

_bearer = HTTPBearer(auto_error=False)


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_producer(request: Request) -> AIOKafkaProducer:
    return request.app.state.producer


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
        "_",  # no event route map in this service
    )

    try:
        ctx = await validate_token(
            token,
            lookup["revoked"],
            lookup["token_raw"],
            redis,
            request.app.state.db,
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired token"},
        )

    structlog.contextvars.bind_contextvars(project_id=ctx.project_id, env=ctx.env)
    return ctx


class RequireScope:
    def __init__(self, scope: str) -> None:
        self.scope = scope

    async def __call__(self, ctx: TokenContext = Depends(get_token_context)) -> TokenContext:
        if not ctx.has_scope(self.scope):
            raise HTTPException(
                status_code=403,
                detail={"code": "forbidden", "message": "Token scope insufficient"},
            )
        return ctx


AuthDep = Annotated[TokenContext, Depends(get_token_context)]
