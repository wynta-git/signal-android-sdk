from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from shared.auth.system_token import InvalidSystemTokenError, SystemTokenContext, validate_system_jwt
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


def get_system_token_context(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> SystemTokenContext:
    from app.config import settings

    if not credentials:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Missing or malformed Authorization header"},
        )
    try:
        return validate_system_jwt(credentials.credentials, settings.system_jwt_public_key)
    except InvalidSystemTokenError:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired system token"},
        )


SystemAuthDep = Annotated[SystemTokenContext, Depends(get_system_token_context)]
