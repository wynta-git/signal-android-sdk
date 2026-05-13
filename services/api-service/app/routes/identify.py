import hashlib
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth.token import TokenContext
from app.config import settings
from app.middleware.ratelimit import project_rate_limit, user_rate_limit

router = APIRouter()
log = structlog.get_logger()

_PII_FIELDS = {"email", "phone"}


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _sanitize_traits(traits: dict[str, Any]) -> dict[str, Any]:
    """Hash known PII keys and rename to *_hash so raw PII is never persisted."""
    result = {}
    for k, v in traits.items():
        if k in _PII_FIELDS:
            result[f"{k}_hash"] = _hash(str(v))
        else:
            result[k] = v
    return result


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
    sanitized = _sanitize_traits(body.traits)

    set_fields: dict[str, Any] = {f"traits.{k}": v for k, v in sanitized.items()}
    set_fields["last_seen_at"] = now

    update: dict[str, Any] = {
        "$set": set_fields,
        "$setOnInsert": {"first_seen_at": now},
    }

    if body.anonymous_id:
        update["$addToSet"] = {"anonymous_ids": body.anonymous_id}

    if body.unset_traits:
        update["$unset"] = {f"traits.{k}": "" for k in body.unset_traits}

    db = request.app.state.mongo[settings.mongo_db]
    try:
        await db["users"].update_one(
            {"project_id": ctx.project_id, "user_id": body.user_id},
            update,
            upsert=True,
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"code": "internal_error", "message": "Failed to save user profile"},
        )

    log.info("identify", user_id=body.user_id, project_id=ctx.project_id)
    return IdentifyResponse(user_id=body.user_id)
