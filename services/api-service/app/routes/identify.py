from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth.token import TokenContext
from app.config import settings
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

    # Build EventEnvelope-compatible payload so event-processor handles it uniformly.
    props: dict[str, Any] = {}
    if body.anonymous_id:
        props["anonymous_id"] = body.anonymous_id
    props.update(body.traits)

    payload: dict[str, Any] = {
        "event_id": str(uuid4()),
        "event_name": "user_identified",
        "schema_version": 1,
        "user_id": body.user_id,
        "project_id": ctx.project_id,
        "timestamp": body.timestamp.isoformat(),
        "received_at": datetime.now(timezone.utc).isoformat(),
        "sdk": {"name": "pam-server", "version": settings.version},
        "properties": props,
    }

    try:
        await request.app.state.producer.publish_identify(payload)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"code": "internal_error", "message": "Failed to publish identify"},
        )

    log.info("identify", user_id=body.user_id)
    return IdentifyResponse(user_id=body.user_id)
