from dataclasses import dataclass
from typing import Any

import jwt

SYSTEM_JWT_ISSUER = "pam-auth-service"
SYSTEM_JWT_ALGORITHM = "RS256"
SYSTEM_JWT_TTL = 3600


class InvalidSystemTokenError(Exception):
    """JWT is missing, malformed, expired, or has an invalid signature.
    Details are intentionally opaque — callers must not distinguish these cases."""


@dataclass(frozen=True)
class SystemTokenContext:
    service: str
    scope: list[str]

    def has_scope(self, required: str) -> bool:
        return required in self.scope


def validate_system_jwt(token: str, public_key: str) -> SystemTokenContext:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            public_key,
            algorithms=[SYSTEM_JWT_ALGORITHM],
            issuer=SYSTEM_JWT_ISSUER,
            options={"require": ["sub", "exp", "iat", "iss"]},
        )
    except jwt.PyJWTError:
        raise InvalidSystemTokenError()

    sub = payload.get("sub")
    scope = payload.get("scope", [])

    if not isinstance(sub, str) or not sub:
        raise InvalidSystemTokenError()
    if not isinstance(scope, list):
        raise InvalidSystemTokenError()

    return SystemTokenContext(service=sub, scope=scope)
