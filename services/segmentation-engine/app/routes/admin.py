from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app import storage
from app.dependencies import AdminDep

router = APIRouter(prefix="/v1/admin/projects/{project_id}/segments", tags=["admin"])


def _db(request: Request):
    return request.app.state.db


@router.get("")
async def list_segments(
    ctx: AdminDep,
    db=Depends(_db),
) -> list[dict[str, Any]]:
    return await storage.list_segments(db, ctx.project_id)


@router.get("/{segment_id}")
async def get_segment(
    ctx: AdminDep,
    segment_id: str,
    db=Depends(_db),
) -> dict[str, Any]:
    seg = await storage.get_segment(db, ctx.project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    member_count = await db["segment_memberships"].count_documents(
        {"project_id": ctx.project_id, "segment_id": segment_id}
    )
    return {**seg, "member_count": member_count}
