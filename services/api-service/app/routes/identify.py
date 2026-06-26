from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from shared.auth.token import TokenContext
from app.config import settings
from app.dependencies import get_client_context
from app.middleware.idempotency import check_idempotency, store_idempotency
from app.middleware.ratelimit import user_rate_limit
from shared.clients.mongo import upsert_device_token, upsert_user_profile

router = APIRouter()
log = structlog.get_logger()


class DeviceInfo(BaseModel):
    token: str
    platform: str = "android"


class IdentifyRequest(BaseModel):
    user_id: str
    anonymous_id: str | None = None
    brand_id: str | None = None
    traits: dict[str, Any] = Field(default_factory=dict)
    unset_traits: list[str] = Field(default_factory=list)
    timestamp: datetime
    device: DeviceInfo | None = None


class IdentifyResponse(BaseModel):
    user_id: str


@router.post(
    "/identify",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=IdentifyResponse,
)
async def identify(
    request: Request,
    body: IdentifyRequest,
    ctx: TokenContext = Depends(get_client_context),
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

    # top-level brand_id takes priority; fall back to traits.brand_id if SDK sends it there
    effective_brand_id = ctx.site_id 

    db = request.app.state.mongo[settings.mongo_db]
    try:
        await upsert_user_profile(
            db,
            project_id=ctx.project_key,
            user_id=body.user_id,
            traits=body.traits,
            anonymous_id=body.anonymous_id,
            unset_traits=body.unset_traits,
            now=now,
            brand_id=effective_brand_id,
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"code": "internal_error", "message": "Failed to save user profile"},
        )

    if body.device:
        await upsert_device_token(
            db,
            project_id=ctx.project_key,
            user_id=body.user_id,
            token=body.device.token,
            platform=body.device.platform,
            brand_id=effective_brand_id,
        )

    log.info("identify", user_id=body.user_id, project_id=ctx.project_id)
    response = IdentifyResponse(user_id=body.user_id)
    await store_idempotency(request, ctx, response.model_dump(mode="json"))
    return response
