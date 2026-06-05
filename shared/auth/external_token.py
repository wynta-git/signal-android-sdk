from dataclasses import dataclass
from typing import Any

import jwt
import structlog

log = structlog.get_logger()

EXTERNAL_JWT_ALGORITHM = "HS256"


class InvalidExternalTokenError(Exception):
    """JWT is missing, malformed, expired, has an invalid signature, or is missing required claims.
    Details are intentionally opaque — callers must not distinguish these cases."""


@dataclass(frozen=True)
class ExternalTokenContext:
    sub: str
    project_id: str


def validate_external_jwt(token: str, secret_key: str) -> ExternalTokenContext:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            secret_key,
            algorithms=[EXTERNAL_JWT_ALGORITHM],
            options={"require": ["exp"]},
        )
    except jwt.PyJWTError:
        raise InvalidExternalTokenError()

    log.info(
        "external_jwt_payload",
        user_id=payload.get("user_id"),
        email=payload.get("email"),
        program_name=payload.get("program name"),
        program_id=payload.get("program id"),
        exp=payload.get("exp"),
    )

    # External token uses "user_id" and "program id" (integer) instead of "sub"/"project_id"
    sub = payload.get("user_id")
    raw_project_id = payload.get("program id")

    if not sub or not str(sub).strip():
        raise InvalidExternalTokenError()
    if raw_project_id is None:
        raise InvalidExternalTokenError()

    return ExternalTokenContext(sub=str(sub), project_id=str(raw_project_id))
