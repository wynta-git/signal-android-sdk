from typing import Annotated

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from shared.auth.portal_token import (
    InvalidPortalTokenError,
    PortalTokenContext,
    validate_portal_token,
)

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
