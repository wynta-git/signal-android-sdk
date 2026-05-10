from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.token import InvalidTokenError, TokenContext, validate_token
from app.config import settings

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
    try:
        ctx = await validate_token(
            credentials.credentials,
            request.app.state.redis,
            request.app.state.mongo[settings.mongo_db],
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired token"},
        )

    # Bind to structlog context so all downstream log lines carry project_id + env
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


# Pre-built type aliases — use these in route signatures for clean one-liners:
#   async def track(ctx: EventsWriteDep, ...):
EventsWriteDep = Annotated[TokenContext, Depends(RequireScope("events:write"))]
AdminDep = Annotated[TokenContext, Depends(RequireScope("admin"))]
