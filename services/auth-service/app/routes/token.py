from datetime import datetime, timezone

import bcrypt
import jwt
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from shared.auth.system_token import SYSTEM_JWT_ALGORITHM, SYSTEM_JWT_ISSUER

router = APIRouter()
log = structlog.get_logger()

_SERVICE_ACCOUNTS_COLLECTION = "service_accounts"


class TokenRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = settings.jwt_token_ttl


@router.post("/token", response_model=TokenResponse)
async def get_system_token(body: TokenRequest, request: Request) -> TokenResponse:
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
        log.warning("system_token_auth_failed", username=body.username)
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_credentials", "message": "Invalid username or password"},
        )

    now = int(datetime.now(tz=timezone.utc).timestamp())
    payload = {
        "sub": doc["username"],
        "iss": SYSTEM_JWT_ISSUER,
        "iat": now,
        "exp": now + settings.jwt_token_ttl,
        "scope": list(doc.get("scope", [])),
    }

    token = jwt.encode(payload, settings.jwt_private_key, algorithm=SYSTEM_JWT_ALGORITHM)

    log.info("system_token_issued", service=doc["username"])
    return TokenResponse(access_token=token, expires_in=settings.jwt_token_ttl)
