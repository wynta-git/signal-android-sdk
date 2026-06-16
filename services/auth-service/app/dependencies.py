from functools import cache
from typing import Annotated

import jwt
import structlog
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    load_pem_private_key,
)
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from shared.auth.portal_token import (
    InvalidPortalTokenError,
    PortalTokenContext,
    validate_portal_token,
)

_bearer = HTTPBearer(auto_error=False)
log = structlog.get_logger()


@cache
def _resolve_public_key() -> str:
    """Return portal_jwt_public_key from config, or derive it from the private key."""
    from app.config import settings

    if settings.portal_jwt_public_key.strip():
        log.debug("portal_public_key_source", source="config")
        return settings.portal_jwt_public_key

    if not settings.portal_jwt_private_key.strip():
        log.error("portal_public_key_unavailable", reason="neither_public_nor_private_key_set")
        return ""

    private_key = load_pem_private_key(
        settings.portal_jwt_private_key.encode(), password=None
    )
    public_pem = private_key.public_key().public_bytes(
        Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
    ).decode()
    log.info("portal_public_key_source", source="derived_from_private_key")
    return public_pem


def get_portal_token_context(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> PortalTokenContext:
    if not credentials:
        log.warning("portal_auth_rejected", reason="missing_authorization_header")
        raise HTTPException(
            status_code=401,
            detail={
                "code": "invalid_token",
                "message": "Missing or malformed Authorization header",
            },
        )

    token = credentials.credentials
    public_key = _resolve_public_key()

    if not public_key:
        log.error("portal_auth_rejected", reason="public_key_unavailable")
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired portal token"},
        )

    # Decode without verification to surface expiry / issuer mismatches in logs
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
        log.debug(
            "portal_token_claims_unverified",
            sub=unverified.get("sub"),
            iss=unverified.get("iss"),
            type=unverified.get("type"),
            exp=unverified.get("exp"),
            project_id=unverified.get("project_id"),
        )
    except Exception as exc:
        log.warning("portal_token_undecodable", error=str(exc))

    try:
        return validate_portal_token(token, public_key)
    except InvalidPortalTokenError as exc:
        log.warning("portal_auth_rejected", reason="invalid_portal_token", error=str(exc))
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired portal token"},
        )


PortalAuthDep = Annotated[PortalTokenContext, Depends(get_portal_token_context)]
