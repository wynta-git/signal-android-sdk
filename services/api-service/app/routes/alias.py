from datetime import datetime, timezone
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.auth.token import TokenContext
from app.config import settings
from app.middleware.ratelimit import project_rate_limit

router = APIRouter()
log = structlog.get_logger()


class AliasRequest(BaseModel):
    previous_user_id: str
    user_id: str


class AliasResponse(BaseModel):
    previous_user_id: str
    user_id: str


@router.post(
    "/v1/alias",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=AliasResponse,
)
async def alias(
    request: Request,
    body: AliasRequest,
    ctx: TokenContext = Depends(project_rate_limit),
) -> AliasResponse:
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "event_id": str(uuid4()),
        "event_name": "user_alias",
        "schema_version": 1,
        "user_id": body.user_id,
        "project_id": ctx.project_id,
        "timestamp": now,
        "received_at": now,
        "sdk": {"name": "pam-server", "version": settings.version},
        "properties": {"previous_user_id": body.previous_user_id},
    }

    try:
        await request.app.state.producer.publish_alias(payload)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"code": "internal_error", "message": "Failed to publish alias"},
        )

    log.info("alias", previous_user_id=body.previous_user_id, user_id=body.user_id)
    return AliasResponse(previous_user_id=body.previous_user_id, user_id=body.user_id)
