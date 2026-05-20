from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from shared.auth.token import TokenContext
from app.config import settings
from app.middleware.idempotency import check_idempotency, store_idempotency
from app.middleware.ratelimit import project_rate_limit, user_rate_limit
from shared.clients.mongo import upsert_user_profile

router = APIRouter()
log = structlog.get_logger()


class IdentifyRequest(BaseModel):
    user_id: str
    anonymous_id: str | None = None
    traits: dict[str, Any] = Field(default_factory=dict)
    unset_traits: list[str] = Field(default_factory=list)
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
    cached = await check_idempotency(request, ctx)
    if cached:
        return IdentifyResponse(**cached)

    await user_rate_limit(ctx.project_id, body.user_id, request.app.state.redis)

    conflict = set(body.traits) & set(body.unset_traits)
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_request",
                "message": f"Keys cannot appear in both traits and unset_traits: {sorted(conflict)}",
            },
        )

    now = datetime.now(timezone.utc)

    db = request.app.state.mongo[settings.mongo_db]
    try:
        await upsert_user_profile(
            db,
            project_id=ctx.project_id,
            user_id=body.user_id,
            traits=body.traits,
            anonymous_id=body.anonymous_id,
            unset_traits=body.unset_traits,
            now=now,
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"code": "internal_error", "message": "Failed to save user profile"},
        )

    log.info("identify", user_id=body.user_id, project_id=ctx.project_id)
    response = IdentifyResponse(user_id=body.user_id)
    await store_idempotency(request, ctx, response.model_dump(mode="json"))
    return response
