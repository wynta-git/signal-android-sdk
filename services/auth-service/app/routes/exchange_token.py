from datetime import datetime, timezone

import jwt
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from shared.auth.external_token import InvalidExternalTokenError, validate_external_jwt
from shared.auth.portal_token import PORTAL_JWT_ALGORITHM, PORTAL_JWT_ISSUER, PORTAL_TOKEN_TYPE

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
        ext_ctx = validate_external_jwt(body.token, settings.external_jwt_secret_key)
    except InvalidExternalTokenError:
        log.warning("exchange_token_invalid_external_jwt")
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_token", "message": "Invalid or expired token"},
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
