from dataclasses import dataclass
from typing import Any

import jwt

PORTAL_JWT_ISSUER = "pam-auth-service"
PORTAL_JWT_ALGORITHM = "RS256"
PORTAL_TOKEN_TYPE = "portal"


class InvalidPortalTokenError(Exception):
    """JWT is missing, malformed, expired, has an invalid signature, or is not a portal token.
    Details are intentionally opaque — callers must not distinguish these cases."""


@dataclass(frozen=True)
class PortalTokenContext:
    service: str
    project_id: str
    user_id: str
    scope: list[str]

    def has_scope(self, required: str) -> bool:
        return required in self.scope


def validate_portal_token(token: str, public_key: str) -> PortalTokenContext:
    
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            public_key,
            algorithms=[PORTAL_JWT_ALGORITHM],
            issuer=PORTAL_JWT_ISSUER,
            options={"require": ["sub", "exp", "iat", "iss"]},
        )
    except jwt.PyJWTError:
        raise InvalidPortalTokenError()

    if payload.get("type") != PORTAL_TOKEN_TYPE:
        raise InvalidPortalTokenError()

    sub = payload.get("sub")
    project_id = payload.get("project_id")
    user_id = payload.get("user_id", "")
    scope = payload.get("scope", [])

    if not isinstance(sub, str) or not sub:
        raise InvalidPortalTokenError()
    if not isinstance(project_id, str) or not project_id:
        raise InvalidPortalTokenError()
    if not isinstance(scope, list):
        raise InvalidPortalTokenError()

    return PortalTokenContext(service=sub, project_id=project_id, user_id=str(user_id), scope=scope)
