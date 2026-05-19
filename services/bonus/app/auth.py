import hashlib
import hmac
import time

from fastapi import Header, Request
from fastapi.exceptions import HTTPException

from app.config import settings


async def verify_s2s_request(
    request: Request,
    x_client_id: str = Header(..., description="Registered S2S client identifier"),
    x_timestamp: str = Header(..., description="Unix epoch seconds at time of request"),
    x_signature: str = Header(..., description="HMAC-SHA256 hex signature of the canonical string"),
) -> None:
    try:
        ts = int(x_timestamp)
    except ValueError:
        raise HTTPException(status_code=401, detail="X-Timestamp must be a Unix epoch integer")

    if abs(time.time() - ts) > 300:
        raise HTTPException(status_code=401, detail="Request timestamp outside the 300-second window")

    secret = settings.s2s_clients.get(x_client_id)
    if secret is None:
        raise HTTPException(status_code=401, detail="Unknown client")

    body = await request.body()
    canonical = f"{x_client_id}\n{x_timestamp}\n".encode() + body
    expected = hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, x_signature.lower()):
        raise HTTPException(status_code=401, detail="Invalid signature")
