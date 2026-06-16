from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from shared.auth.token import (
    InvalidTokenError,
    TokenContext,
    hash_token,
    token_cache_key,
    token_revoke_key,
    validate_token,
)
from app.config import settings
from shared.clients.mongo import load_event_routes
from shared.clients.redis import get_lookup, write_event_route_map
from shared.services.client import validate_client

log = structlog.get_logger()

_bearer = HTTPBearer(auto_error=False)

EVENT_ROUTE_MAP_KEY = "pam:event_route_map"
EVENT_ROUTE_MAP_TTL = 300  # 5 minutes


def _invert_routes(routes: list[dict]) -> dict[str, list[str]]:
    """Convert topic-centric Mongo docs to event-centric map for runtime lookup."""
    result: dict[str, list[str]] = {}
    for doc in routes:
        topic = doc["topic"]
        for event_name in doc.get("event_names", []):
            result.setdefault(event_name, []).append(topic)
    return result


async def get_token_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> TokenContext:
    return await _validate_token_from_credentials(request, credentials)


async def get_client_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> TokenContext:
    client_id = request.headers.get("X-Client-Id")
    client_secret = request.headers.get("X-Client-Secret")

    if not client_id or not client_secret:
        return await _validate_token_from_credentials(request, credentials)

    result = await validate_client(client_id, client_secret, request.app.state.redis)

    lookup = await get_lookup(request.app.state.redis, "__noop__", "__noop__", EVENT_ROUTE_MAP_KEY)
    event_route_map = lookup["event_route_map"]
    if not event_route_map:
        routes = await load_event_routes(request.app.state.mongo[settings.mongo_db])
        event_route_map = _invert_routes(routes)
        await write_event_route_map(request.app.state.redis, EVENT_ROUTE_MAP_KEY, event_route_map, EVENT_ROUTE_MAP_TTL)

    request.state.event_route_map = event_route_map

    ctx = TokenContext(
        project_id=str(result.program_id or result.site_id),
        scope=["events:write"],
        env="live",
    )
    structlog.contextvars.bind_contextvars(project_id=ctx.project_id, env=ctx.env)
    return ctx
   

async def _validate_token_from_credentials(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
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
        EVENT_ROUTE_MAP_KEY,
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

    event_route_map = lookup["event_route_map"]
    if not event_route_map:
        routes = await load_event_routes(request.app.state.mongo[settings.mongo_db])
        event_route_map = _invert_routes(routes)
        await write_event_route_map(redis, EVENT_ROUTE_MAP_KEY, event_route_map, EVENT_ROUTE_MAP_TTL)

    request.state.event_route_map = event_route_map
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


def get_producer(request: Request) -> None:
    return request.app.state.producer


# Pre-built type aliases — use these in route signatures for clean one-liners:
#   async def track(ctx: EventsWriteDep, ...):
EventsWriteDep = Annotated[TokenContext, Depends(RequireScope("events:write"))]
AdminDep = Annotated[TokenContext, Depends(RequireScope("admin"))]
ClientDep = Annotated[TokenContext, Depends(get_client_context)]
