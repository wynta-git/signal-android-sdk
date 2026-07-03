from dataclasses import dataclass
from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Query, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from shared.auth.portal_token import InvalidPortalTokenError, PortalTokenContext, validate_portal_token
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


def get_portal_token_context(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> PortalTokenContext:
    from app.config import settings

    if not credentials:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Missing or malformed Authorization header"},
        )
    try:
        return validate_portal_token(credentials.credentials, settings.portal_jwt_public_key)
    except InvalidPortalTokenError:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired portal token"},
        )


PortalAuthDep = Annotated[PortalTokenContext, Depends(get_portal_token_context)]


@dataclass
class ProjectContext:
    project_id: str


async def get_project_context(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    project_id: str | None = Query(default=None),
) -> ProjectContext:
    from app.config import settings

    if not credentials:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Missing or malformed Authorization header"},
        )

    # Try portal token first — project_id is embedded in the token.
    try:
        ctx = validate_portal_token(credentials.credentials, settings.portal_jwt_public_key)
        project_id = ctx.project_id
        return ProjectContext(project_id=project_id)
    except Exception:
        pass

    # Fall back to system token — project_id must be supplied as a query param.
    try:
        ctx = validate_system_jwt(credentials.credentials, settings.system_jwt_public_key)
        project_id = ctx.project_id
    except InvalidSystemTokenError:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired token"},
        )

    if not project_id:
        raise HTTPException(
            status_code=422,
            detail={"code": "missing_project_id", "message": "`project_id` query parameter required for system tokens"},
        )
    return ProjectContext(project_id=project_id)


DualAuthDep = Annotated[ProjectContext, Depends(get_project_context)]
