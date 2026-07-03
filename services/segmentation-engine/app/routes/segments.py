import csv
import io
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

import aioboto3
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field

from app import storage
from app.config import settings
from app.dependencies import DualAuthDep, PortalAuthDep
from app.dsl.validator import SegmentRule
from app.refresh import scheduled
from app.refresh.engine import evaluate_segment

router = APIRouter(prefix="/segments", tags=["segments"])


def _db(request: Request):
    return request.app.state.db


def _ch(request: Request):
    return request.app.state.ch


def _redis(request: Request):
    return request.app.state.redis


class SegmentCreateRequest(BaseModel):
    name: str
    rule: SegmentRule
    refresh_strategy: Literal["scheduled", "on_event", "one_time"]
    scheduled_cron: str | None = Field(default=None)
    created_by: str | None = Field(default=None)
    brand_id: str | None = Field(default=None)


class SegmentUpdateRequest(BaseModel):
    name: str | None = None
    rule: SegmentRule | None = None
    refresh_strategy: Literal["scheduled", "on_event", "one_time"] | None = None
    scheduled_cron: str | None = None
    brand_id: str | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_segment(
    ctx: PortalAuthDep,
    body: SegmentCreateRequest,
    background_tasks: BackgroundTasks,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    project_id = ctx.project_id
    segment_id = str(uuid4())

    doc: dict[str, Any] = {
        "project_id": project_id,
        "segment_id": segment_id,
        "name": body.name,
        "type": "filter",
        "rule": body.rule.model_dump(),
        "refresh_strategy": body.refresh_strategy,
        "scheduled_cron": body.scheduled_cron,
        "created_by": body.created_by,
        "brand_id": body.brand_id,
        "members_count": None,
        "last_refresh_time": None,
    }
    await storage.create_segment(db, doc)

    if body.refresh_strategy == "scheduled":
        scheduled.register_segment(doc, db, ch, redis)
    elif body.refresh_strategy == "one_time":
        background_tasks.add_task(
            evaluate_segment, project_id, segment_id, body.rule, db, ch, redis, body.brand_id
        )

    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("")
async def list_segments(ctx: PortalAuthDep, db=Depends(_db), brand_id: str | None = Query(default=None)) -> list[dict[str, Any]]:
    return await storage.list_segments(db, ctx.project_id, brand_id=brand_id)


@router.get("/stats")
async def get_segment_stats(
    ctx: PortalAuthDep, db=Depends(_db), redis=Depends(_redis), brand_id: str | None = Query(default=None)
) -> dict[str, Any]:
    return await storage.get_segment_stats(db, ctx.project_id, redis, brand_id=brand_id)


@router.get("/{segment_id}")
async def get_segment(
    ctx: PortalAuthDep, segment_id: str, db=Depends(_db)
) -> dict[str, Any]:
    seg = await storage.get_segment(db, ctx.project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")
    return seg


@router.put("/{segment_id}")
async def update_segment(
    ctx: PortalAuthDep,
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
    if body.brand_id is not None:
        updates["brand_id"] = body.brand_id

    await storage.update_segment(db, project_id, segment_id, updates)

    merged = {**seg, **updates}
    if merged.get("refresh_strategy") == "scheduled":
        scheduled.register_segment(merged, db, ch, redis)
    else:
        scheduled.unregister_segment(project_id, segment_id)

    return merged


@router.delete("/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_segment(
    ctx: PortalAuthDep, segment_id: str, db=Depends(_db), redis=Depends(_redis)
) -> None:
    deleted = await storage.delete_segment(db, ctx.project_id, segment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="segment not found")
    await storage.delete_memberships(redis, ctx.project_id, segment_id)
    scheduled.unregister_segment(ctx.project_id, segment_id)


@router.get("/{segment_id}/members")
async def list_segment_members(
    ctx: PortalAuthDep,
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
    ctx: DualAuthDep,
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


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_custom_audience(
    ctx: PortalAuthDep,
    db=Depends(_db),
    redis=Depends(_redis),
    name: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    project_id = ctx.project_id

    if not (file.content_type in ("text/csv", "application/csv") or (file.filename or "").endswith(".csv")):
        raise HTTPException(status_code=415, detail="Only CSV files are supported")

    raw = await file.read()
    if len(raw) > settings.custom_audience_max_bytes:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if r]

    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # Detect header row — first cell matches common user_id column names
    first_cell = rows[0][0].strip().lower()
    user_id_col = 0
    data_rows = rows[1:] if first_cell in ("user_id", "userid", "id") else rows

    if not data_rows:
        raise HTTPException(status_code=400, detail="No user IDs found in CSV")
    if len(data_rows) > settings.custom_audience_max_rows:
        raise HTTPException(status_code=400, detail=f"CSV exceeds {settings.custom_audience_max_rows:,} row limit")

    user_ids = list(dict.fromkeys(
        row[user_id_col].strip() for row in data_rows if row and row[user_id_col].strip()
    ))
    if not user_ids:
        raise HTTPException(status_code=400, detail="No valid user IDs found in CSV")

    segment_id = f"seg_{uuid4().hex[:12]}"
    s3_key = f"{project_id}/{segment_id}.csv"
    s3_url = f"https://{settings.s3_bucket}.s3.{settings.s3_region}.amazonaws.com/{s3_key}"

    session = aioboto3.Session()
    async with session.client(
        "s3",
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id or None,
        aws_secret_access_key=settings.s3_secret_access_key or None,
        endpoint_url=settings.s3_endpoint_url or None,
    ) as s3:
        try:
            await s3.put_object(Bucket=settings.s3_bucket, Key=s3_key, Body=raw, ContentType="text/csv")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to upload to S3: {exc}") from exc

    now = datetime.now(tz=timezone.utc)
    doc: dict[str, Any] = {
        "project_id": project_id,
        "segment_id": segment_id,
        "name": name,
        "type": "custom_audience",
        "rule": None,
        "refresh_strategy": "one_time",
        "scheduled_cron": None,
        "s3_key": s3_key,
        "s3_url": s3_url,
        "members_count": len(user_ids),
        "last_refresh_time": now,
    }
    await storage.create_segment(db, doc)
    await storage.bulk_upsert_memberships(redis, project_id, segment_id, set(user_ids))

    return {
        "segment_id": segment_id,
        "name": name,
        "members_count": len(user_ids),
        "s3_url": s3_url,
    }


@router.post("/{segment_id}/evaluate", status_code=status.HTTP_202_ACCEPTED)
async def trigger_evaluate(
    ctx: PortalAuthDep,
    segment_id: str,
    db=Depends(_db),
    ch=Depends(_ch),
    redis=Depends(_redis),
) -> dict[str, Any]:
    project_id = ctx.project_id
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")

    if seg.get("type") == "custom_audience":
        return {"segment_id": segment_id, "detail": "custom_audience segments are not re-evaluated"}

    rule = SegmentRule.model_validate(seg["rule"])
    final = await evaluate_segment(project_id, segment_id, rule, db, ch, redis, brand_id=seg.get("brand_id"))
    return {"segment_id": segment_id, "size": len(final), "computed_at": datetime.now(tz=timezone.utc)}
