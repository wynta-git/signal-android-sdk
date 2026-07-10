from datetime import datetime, timezone

import jwt
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.cache import get_redis
from app.config import settings
from shared.auth.external_token import InvalidExternalTokenError, validate_external_jwt
from shared.auth.portal_token import PORTAL_JWT_ALGORITHM, PORTAL_JWT_ISSUER, PORTAL_TOKEN_TYPE
from shared.services.system_user import ensure_system_user_provisioned

router = APIRouter()
log = structlog.get_logger()

_SERVICE_ACCOUNTS_COLLECTION = "service_accounts"
_PORTAL_UI_ACCOUNT = "portal-ui"


class ExchangeTokenRequest(BaseModel):
    token: str


class ExchangeTokenData(BaseModel):
    token: str
    refresh_interval: int


class ExchangeTokenResponse(BaseModel):
    data: ExchangeTokenData


@router.post("/exchange_token", response_model=ExchangeTokenResponse)
async def exchange_token(body: ExchangeTokenRequest, request: Request) -> ExchangeTokenResponse:
    if not settings.external_jwt_secret_key:
        raise HTTPException(status_code=503, detail={"code": "not_configured", "message": "External JWT validation not configured"})

    try:
        ext_ctx = await validate_external_jwt(
            body.token,
            settings.external_jwt_secret_key,
            redis=get_redis(),
            program_key_cache_ttl=settings.program_key_cache_ttl,
        )
    except InvalidExternalTokenError:
        log.warning("exchange_token_invalid_external_jwt")
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired token"},
        )

    # Bridging this external identity into the portal for the first time —
    # ensure it has a system_user + user_site_role row (best-effort, never raises).
    await ensure_system_user_provisioned(
        get_redis(), external_id=ext_ctx.sub, email=ext_ctx.email, program_key=ext_ctx.project_id,
    )

    db = request.app.state.mongo[settings.mongo_db]
    doc = await db[_SERVICE_ACCOUNTS_COLLECTION].find_one(
        {"username": _PORTAL_UI_ACCOUNT, "status": "active"}
    )
    if not doc:
        log.error("exchange_token_portal_ui_account_missing")
        raise HTTPException(status_code=503, detail={"code": "misconfigured", "message": "Service account not found"})

    now = int(datetime.now(tz=timezone.utc).timestamp())
    payload = {
        "sub": _PORTAL_UI_ACCOUNT,
        "iss": PORTAL_JWT_ISSUER,
        "type": PORTAL_TOKEN_TYPE,
        "project_id": ext_ctx.project_id,
        "user_id": ext_ctx.sub,
        "iat": now,
        "exp": now + settings.portal_token_ttl,
        "scope": list(doc.get("scope", [])),
    }

    token = jwt.encode(payload, settings.portal_jwt_private_key, algorithm=PORTAL_JWT_ALGORITHM)

    log.info("exchange_token_issued", sub=ext_ctx.sub, project_id=ext_ctx.project_id)
    return ExchangeTokenResponse(
        data=ExchangeTokenData(token=token, refresh_interval=settings.portal_refresh_interval)
    )
