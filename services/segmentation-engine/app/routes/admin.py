from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from app import storage
from app.dependencies import SystemAuthDep
from app.dsl.validator import SegmentRule
from app.refresh.engine import evaluate_segment

router = APIRouter(prefix="/v1/admin/projects/{project_id}/segments", tags=["admin"])


def _db(request: Request):
    return request.app.state.db


def _ch(request: Request):
    return request.app.state.ch


def _redis(request: Request):
    return request.app.state.redis


@router.get("")
async def list_segments(
    ctx: SystemAuthDep,
    project_id: str,
    db=Depends(_db),
) -> list[dict[str, Any]]:
    return await storage.list_segments(db, project_id)


@router.get("/{segment_id}")
async def get_segment(
    ctx: SystemAuthDep,
    project_id: str,
    segment_id: str,
    db=Depends(_db),
    redis=Depends(_redis),
) -> dict[str, Any]:
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    member_count = await redis.scard(f"pam:seg:{project_id}:{segment_id}:members")
    return {**seg, "member_count": member_count}


@router.post("/{segment_id}/evaluate", status_code=status.HTTP_202_ACCEPTED)
async def evaluate_segment_admin(
    ctx: SystemAuthDep,
    project_id: str,
    segment_id: str,
    background_tasks: BackgroundTasks,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    rule = SegmentRule.model_validate(seg["rule"])
    background_tasks.add_task(evaluate_segment, project_id, segment_id, rule, db, ch, redis)
    return {
        "segment_id": segment_id,
        "status": "evaluation_queued",
        "queued_at": datetime.now(tz=timezone.utc),
    }
