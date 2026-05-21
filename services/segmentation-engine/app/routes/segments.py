from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app import storage
from app.dependencies import AuthDep
from app.dsl.validator import SegmentRule
from app.refresh import scheduled
from app.refresh.engine import evaluate_segment

router = APIRouter(prefix="/api/v1/segments", tags=["segments"])


def _db(request: Request):
    return request.app.state.db


def _ch(request: Request):
    return request.app.state.ch


def _redis(request: Request):
    return request.app.state.redis


class SegmentCreateRequest(BaseModel):
    segment_id: str
    name: str
    rule: SegmentRule
    refresh_strategy: Literal["scheduled", "on_event", "one_time"]
    scheduled_cron: str | None = Field(default=None)
    created_by: str | None = Field(default=None)


class SegmentUpdateRequest(BaseModel):
    name: str | None = None
    rule: SegmentRule | None = None
    refresh_strategy: Literal["scheduled", "on_event", "one_time"] | None = None
    scheduled_cron: str | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_segment(
    ctx: AuthDep,
    body: SegmentCreateRequest,
    background_tasks: BackgroundTasks,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    project_id = ctx.project_id
    existing = await storage.get_segment(db, project_id, body.segment_id)
    if existing:
        raise HTTPException(status_code=409, detail="segment_id already exists")

    doc: dict[str, Any] = {
        "project_id": project_id,
        "segment_id": body.segment_id,
        "name": body.name,
        "rule": body.rule.model_dump(),
        "refresh_strategy": body.refresh_strategy,
        "scheduled_cron": body.scheduled_cron,
        "created_by": body.created_by,
        "members_count": None,
        "last_refresh_time": None,
    }
    await storage.create_segment(db, doc)

    if body.refresh_strategy == "scheduled":
        scheduled.register_segment(doc, db, ch, redis)
    elif body.refresh_strategy == "one_time":
        background_tasks.add_task(
            evaluate_segment, project_id, body.segment_id, body.rule, db, ch, redis
        )

    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("")
async def list_segments(ctx: AuthDep, db=Depends(_db)) -> list[dict[str, Any]]:
    return await storage.list_segments(db, ctx.project_id)


@router.get("/{segment_id}")
async def get_segment(
    ctx: AuthDep, segment_id: str, db=Depends(_db)
) -> dict[str, Any]:
    seg = await storage.get_segment(db, ctx.project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")
    return seg


@router.put("/{segment_id}")
async def update_segment(
    ctx: AuthDep,
    segment_id: str,
    body: SegmentUpdateRequest,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    project_id = ctx.project_id
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")

    updates: dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.rule is not None:
        updates["rule"] = body.rule.model_dump()
    if body.refresh_strategy is not None:
        updates["refresh_strategy"] = body.refresh_strategy
    if body.scheduled_cron is not None:
        updates["scheduled_cron"] = body.scheduled_cron

    await storage.update_segment(db, project_id, segment_id, updates)

    merged = {**seg, **updates}
    if merged.get("refresh_strategy") == "scheduled":
        scheduled.register_segment(merged, db, ch, redis)
    else:
        scheduled.unregister_segment(project_id, segment_id)

    return merged


@router.delete("/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_segment(
    ctx: AuthDep, segment_id: str, db=Depends(_db), redis=Depends(_redis)
) -> None:
    deleted = await storage.delete_segment(db, ctx.project_id, segment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="segment not found")
    await storage.delete_memberships(redis, ctx.project_id, segment_id)
    scheduled.unregister_segment(ctx.project_id, segment_id)


@router.get("/{segment_id}/members")
async def list_segment_members(
    ctx: AuthDep,
    segment_id: str,
    db=Depends(_db),
    redis=Depends(_redis),
    limit: int = Query(default=100, ge=1, le=1000),
    cursor: str | None = Query(default=None),
) -> dict[str, Any]:
    seg = await storage.get_segment(db, ctx.project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")

    # Fetch one extra to determine if a next page exists.
    rows = await storage.list_segment_members(redis, ctx.project_id, segment_id, limit + 1, cursor)
    has_more = len(rows) > limit
    members = rows[:limit]

    return {
        "segment_id": segment_id,
        "members": members,
        "has_more": has_more,
        "next_cursor": members[-1]["user_id"] if has_more else None,
        "total_members": seg.get("members_count"),
    }


@router.get("/{segment_id}/members/{user_id}")
async def check_membership(
    ctx: AuthDep,
    segment_id: str,
    user_id: str,
    db=Depends(_db),
    redis=Depends(_redis),
) -> dict[str, Any]:
    seg = await storage.get_segment(db, ctx.project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")

    doc = await storage.get_membership(redis, ctx.project_id, segment_id, user_id)
    if doc is None:
        return {"segment_id": segment_id, "user_id": user_id, "is_member": False, "joined_at": None}

    return {"segment_id": segment_id, "user_id": user_id, "is_member": True, "joined_at": doc["joined_at"]}


@router.post("/{segment_id}/evaluate", status_code=status.HTTP_202_ACCEPTED)
async def trigger_evaluate(
    ctx: AuthDep,
    segment_id: str,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    project_id = ctx.project_id
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")

    rule = SegmentRule.model_validate(seg["rule"])
    final = await evaluate_segment(project_id, segment_id, rule, db, ch, redis)
    return {"segment_id": segment_id, "size": len(final), "computed_at": datetime.now(tz=timezone.utc)}
