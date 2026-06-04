from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app import storage
from app.dependencies import SystemAuthDep
from app.dsl.validator import SegmentRule
from app.refresh.engine import evaluate_segment

router = APIRouter(prefix="/api/v1/segments/admin/projects/{project_id}", tags=["admin"])


class DerivedRuleParameter(BaseModel):
    key: str
    type: str  # "number" only for now


class DerivedRuleCreateRequest(BaseModel):
    rule_id: str
    name: str
    sql: str
    parameters: list[DerivedRuleParameter] = []


class DerivedRuleUpdateRequest(BaseModel):
    name: str | None = None
    sql: str | None = None
    parameters: list[DerivedRuleParameter] | None = None


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


# ── Derived rules ─────────────────────────────────────────────────────────────

@router.post("/derived-rules", status_code=status.HTTP_201_CREATED)
async def create_derived_rule(
    ctx: SystemAuthDep,
    project_id: str,
    body: DerivedRuleCreateRequest,
    db=Depends(_db),
) -> dict[str, Any]:
    existing = await storage.get_derived_rule(db, project_id, body.rule_id)
    if existing:
        raise HTTPException(status_code=409, detail="Derived rule with this rule_id already exists")
    now = datetime.now(tz=timezone.utc)
    doc = {
        "project_id": project_id,
        "rule_id": body.rule_id,
        "name": body.name,
        "sql": body.sql,
        "parameters": [p.model_dump() for p in body.parameters],
        "created_at": now,
        "updated_at": now,
    }
    await storage.create_derived_rule(db, doc)
    return {k: v for k, v in doc.items() if k != "project_id"}


@router.get("/derived-rules")
async def list_derived_rules(
    ctx: SystemAuthDep,
    project_id: str,
    db=Depends(_db),
) -> list[dict[str, Any]]:
    return await storage.list_derived_rules(db, project_id)


@router.patch("/derived-rules/{rule_id}")
async def update_derived_rule(
    ctx: SystemAuthDep,
    project_id: str,
    rule_id: str,
    body: DerivedRuleUpdateRequest,
    db=Depends(_db),
) -> dict[str, Any]:
    updates: dict[str, Any] = {"updated_at": datetime.now(tz=timezone.utc)}
    if body.name is not None:
        updates["name"] = body.name
    if body.sql is not None:
        updates["sql"] = body.sql
    if body.parameters is not None:
        updates["parameters"] = [p.model_dump() for p in body.parameters]
    matched = await storage.update_derived_rule(db, project_id, rule_id, updates)
    if not matched:
        raise HTTPException(status_code=404, detail="Derived rule not found")
    return await storage.get_derived_rule(db, project_id, rule_id)


@router.delete("/derived-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_derived_rule(
    ctx: SystemAuthDep,
    project_id: str,
    rule_id: str,
    db=Depends(_db),
) -> None:
    deleted = await storage.delete_derived_rule(db, project_id, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Derived rule not found")
