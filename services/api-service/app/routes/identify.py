from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth.token import TokenContext
from app.middleware.ratelimit import project_rate_limit, user_rate_limit

router = APIRouter()
log = structlog.get_logger()


class IdentifyRequest(BaseModel):
    user_id: str
    anonymous_id: str | None = None
    traits: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime


class IdentifyResponse(BaseModel):
    user_id: str


@router.post(
    "/v1/identify",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=IdentifyResponse,
)
async def identify(
    request: Request,
    body: IdentifyRequest,
    ctx: TokenContext = Depends(project_rate_limit),
) -> IdentifyResponse:
    await user_rate_limit(ctx.project_id, body.user_id, request.app.state.redis)

    payload: dict[str, Any] = {
        "event_id": str(uuid4()),
        "user_id": body.user_id,
        "anonymous_id": body.anonymous_id,
        "traits": body.traits,
        "project_id": ctx.project_id,
        "timestamp": body.timestamp.isoformat(),
        "received_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await request.app.state.forwarder.send_identify(payload)
    except Exception:
        raise HTTPException(
            status_code=502,
            detail={"code": "internal_error", "message": "Failed to forward identify"},
        )

    log.info("identify", user_id=body.user_id)
    return IdentifyResponse(user_id=body.user_id)
