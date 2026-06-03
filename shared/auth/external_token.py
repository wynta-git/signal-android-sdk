from dataclasses import dataclass
from typing import Any

import jwt

EXTERNAL_JWT_ALGORITHM = "RS256"


class InvalidExternalTokenError(Exception):
    """JWT is missing, malformed, expired, has an invalid signature, or is missing required claims.
    Details are intentionally opaque — callers must not distinguish these cases."""


@dataclass(frozen=True)
class ExternalTokenContext:
    sub: str
    project_id: str


def validate_external_jwt(token: str, public_key: str) -> ExternalTokenContext:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            public_key,
            algorithms=[EXTERNAL_JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.PyJWTError:
        raise InvalidExternalTokenError()

    sub = payload.get("sub")
    project_id = payload.get("project_id")

    if not isinstance(sub, str) or not sub:
        raise InvalidExternalTokenError()
    if not isinstance(project_id, str) or not project_id:
        raise InvalidExternalTokenError()

    return ExternalTokenContext(sub=sub, project_id=project_id)
