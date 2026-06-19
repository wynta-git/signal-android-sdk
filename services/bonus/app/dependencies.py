from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from shared.auth.portal_token import (
    InvalidPortalTokenError,
    PortalTokenContext,
    validate_portal_token,
)
from shared.services.client import get_client_site_id

_bearer = HTTPBearer(auto_error=False)


def get_portal_token_context(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> PortalTokenContext:
    from app.config import settings

    print("Getting portal token context",credentials)
    if not credentials:
        print("No credentials provided")
        raise HTTPException(
            status_code=401,
            detail={
                "code": "invalid_token",
                "message": "Missing or malformed Authorization header",
            },
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
class S2SContext:
    site_id: int
    client_id: str
    redis: Redis


async def get_s2s_context(
    request: Request,
    x_client_id: str = Header(..., alias="x-client-id"),
) -> S2SContext:
    site_id = await get_client_site_id(x_client_id, request.app.state.redis)
    if site_id is None:
        raise HTTPException(status_code=401, detail="Unknown client")
    return S2SContext(site_id=site_id, client_id=x_client_id, redis=request.app.state.redis)


S2SContextDep = Annotated[S2SContext, Depends(get_s2s_context)]
