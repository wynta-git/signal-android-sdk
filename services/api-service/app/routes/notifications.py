from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, model_validator

from app.config import settings
from app.dependencies import get_client_context
from app.middleware.ratelimit import user_rate_limit
from shared.auth.token import TokenContext
from shared.clients.mongo import (
    count_unread_notifications,
    delete_notification_inbox,
    list_notification_inbox,
    mark_notifications_read,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])
log = structlog.get_logger()


def _db(request: Request):
    return request.app.state.mongo[settings.mongo_db]


class InboxResponse(BaseModel):
    notifications: list[dict[str, Any]]
    next_cursor: str | None
    unread_count: int


class UnreadCountResponse(BaseModel):
    unread_count: int


class MarkReadRequest(BaseModel):
    notification_ids: list[str] | None = None
    mark_all: bool | None = None

    @model_validator(mode="after")
    def check_exactly_one(self) -> "MarkReadRequest":
        has_ids = bool(self.notification_ids)
        has_mark_all = bool(self.mark_all)
        if has_ids == has_mark_all:
            raise ValueError("provide exactly one of notification_ids or mark_all")
        return self


class MarkReadResponse(BaseModel):
    updated: int


def _to_client_notification(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "notification_id": doc.get("notification_id"),
        "campaign_id": doc.get("campaign_id"),
        "variant_id": doc.get("variant_id"),
        "template_type": doc.get("template_type"),
        "render_engine": doc.get("render_engine"),
        "trigger_type": doc.get("trigger_type"),
        "target_screens": doc.get("target_screens"),
        "title": doc.get("title"),
        "body": doc.get("body"),
        "media": doc.get("media"),
        "cta": doc.get("cta", []),
        "close_button_visibility": doc.get("close_button_visibility", "always"),
        "layout": doc.get("layout"),
        "web_view_url": doc.get("web_view_url"),
        "created_at": doc.get("created_at"),
        "expires_at": doc.get("expires_at"),
        "read": doc.get("read", False),
    }


@router.get("/inbox", response_model=InboxResponse)
async def get_inbox(
    request: Request,
    user_id: str = Query(...),
    unread_only: bool = Query(False),
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    ctx: TokenContext = Depends(get_client_context),
) -> InboxResponse:
    await user_rate_limit(ctx.project_id, user_id, request.app.state.redis)

    before: datetime | None = None
    if cursor is not None:
        try:
            before = datetime.fromisoformat(cursor)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_cursor", "message": "cursor is malformed"},
            )

    db = _db(request)
    rows = await list_notification_inbox(
        db, ctx.project_key, user_id, unread_only=unread_only, before=before, limit=limit
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1]["created_at"].isoformat() if has_more and rows else None
    unread_count = await count_unread_notifications(db, ctx.project_key, user_id)

    return InboxResponse(
        notifications=[_to_client_notification(r) for r in rows],
        next_cursor=next_cursor,
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    request: Request,
    user_id: str = Query(...),
    ctx: TokenContext = Depends(get_client_context),
) -> UnreadCountResponse:
    await user_rate_limit(ctx.project_id, user_id, request.app.state.redis)
    count = await count_unread_notifications(_db(request), ctx.project_key, user_id)
    return UnreadCountResponse(unread_count=count)


@router.post("/read", response_model=MarkReadResponse)
async def mark_read(
    request: Request,
    body: MarkReadRequest,
    user_id: str = Query(...),
    ctx: TokenContext = Depends(get_client_context),
) -> MarkReadResponse:
    await user_rate_limit(ctx.project_id, user_id, request.app.state.redis)
    updated = await mark_notifications_read(
        _db(request),
        ctx.project_key,
        user_id,
        notification_ids=body.notification_ids,
        mark_all=bool(body.mark_all),
    )
    return MarkReadResponse(updated=updated)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    request: Request,
    notification_id: str,
    user_id: str = Query(...),
    ctx: TokenContext = Depends(get_client_context),
) -> None:
    await user_rate_limit(ctx.project_id, user_id, request.app.state.redis)
    deleted = await delete_notification_inbox(_db(request), ctx.project_key, user_id, notification_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"code": "notification_not_found", "message": "notification not found"},
        )
