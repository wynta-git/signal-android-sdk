from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app import storage
from app.config import settings
from app.dsl.validator import InSegmentFilter, SegmentRule
from app.refresh import scheduled
from app.refresh.engine import evaluate_segment

router = APIRouter(prefix="/v1/segments", tags=["segments"])


def _check_in_segment_allowed(rule: SegmentRule) -> None:
    if settings.membership_tracking_enabled:
        return
    if any(isinstance(f, InSegmentFilter) for f in rule.filters):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="in_segment filters require membership_tracking_enabled=true",
        )


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
    refresh_strategy: Literal["scheduled", "on_event"]
    scheduled_cron: str | None = Field(default=None)


class SegmentUpdateRequest(BaseModel):
    name: str | None = None
    rule: SegmentRule | None = None
    refresh_strategy: Literal["scheduled", "on_event"] | None = None
    scheduled_cron: str | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_segment(
    project_id: str,
    body: SegmentCreateRequest,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    _check_in_segment_allowed(body.rule)

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
        "size": None,
        "computed_at": None,
    }
    await storage.create_segment(db, doc)

    if body.refresh_strategy == "scheduled":
        scheduled.register_segment(doc, db, ch, redis)

    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("")
async def list_segments(project_id: str, db=Depends(_db)) -> list[dict[str, Any]]:
    return await storage.list_segments(db, project_id)


@router.get("/{segment_id}")
async def get_segment(
    project_id: str, segment_id: str, db=Depends(_db)
) -> dict[str, Any]:
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")
    return seg


@router.put("/{segment_id}")
async def update_segment(
    project_id: str,
    segment_id: str,
    body: SegmentUpdateRequest,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")

    if body.rule is not None:
        _check_in_segment_allowed(body.rule)

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
    project_id: str, segment_id: str, db=Depends(_db)
) -> None:
    deleted = await storage.delete_segment(db, project_id, segment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="segment not found")
    scheduled.unregister_segment(project_id, segment_id)


@router.post("/{segment_id}/evaluate", status_code=status.HTTP_202_ACCEPTED)
async def trigger_evaluate(
    project_id: str,
    segment_id: str,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")

    rule = SegmentRule.model_validate(seg["rule"])
    final = await evaluate_segment(project_id, segment_id, rule, db, ch, redis)
    return {"segment_id": segment_id, "size": len(final), "computed_at": datetime.now(tz=timezone.utc)}
