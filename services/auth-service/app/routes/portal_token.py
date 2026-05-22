from datetime import datetime, timezone

import bcrypt
import jwt
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from shared.auth.portal_token import PORTAL_JWT_ALGORITHM, PORTAL_JWT_ISSUER, PORTAL_TOKEN_TYPE

router = APIRouter()
log = structlog.get_logger()

_SERVICE_ACCOUNTS_COLLECTION = "service_accounts"


class PortalTokenRequest(BaseModel):
    username: str
    password: str
    project_id: str


class PortalTokenData(BaseModel):
    token: str
    refresh_interval: int


class PortalTokenResponse(BaseModel):
    data: PortalTokenData


@router.post("/portal_token", response_model=PortalTokenResponse)
async def get_portal_token(body: PortalTokenRequest, request: Request) -> PortalTokenResponse:
    db = request.app.state.mongo[settings.mongo_db]
    doc = await db[_SERVICE_ACCOUNTS_COLLECTION].find_one(
        {"username": body.username, "status": "active"}
    )

    # Constant-time failure — never reveal whether username exists or password is wrong
    valid = False
    if doc:
        try:
            valid = bcrypt.checkpw(
                body.password.encode(), doc["password_hash"].encode()
            )
        except Exception:
            valid = False

    if not valid:
        log.warning("portal_token_auth_failed", username=body.username)
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_credentials", "message": "Invalid username or password"},
        )

    now = int(datetime.now(tz=timezone.utc).timestamp())
    payload = {
        "sub": doc["username"],
        "iss": PORTAL_JWT_ISSUER,
        "type": PORTAL_TOKEN_TYPE,
        "project_id": body.project_id,
        "iat": now,
        "exp": now + settings.portal_token_ttl,
        "scope": list(doc.get("scope", [])),
    }

    token = jwt.encode(payload, settings.portal_jwt_private_key, algorithm=PORTAL_JWT_ALGORITHM)

    log.info("portal_token_issued", service=doc["username"], project_id=body.project_id)
    return PortalTokenResponse(
        data=PortalTokenData(token=token, refresh_interval=settings.portal_refresh_interval)
    )
