from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app import storage

router = APIRouter(prefix="/v1/admin/projects/{project_id}/segments", tags=["admin"])


def _db(request: Request):
    return request.app.state.db


@router.get("")
async def list_segments(
    project_id: str,
    db=Depends(_db),
) -> list[dict[str, Any]]:
    return await storage.list_segments(db, project_id)


@router.get("/{segment_id}")
async def get_segment(
    project_id: str,
    segment_id: str,
    db=Depends(_db),
) -> dict[str, Any]:
    seg = await storage.get_segment(db, project_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    member_count = await db["segment_memberships"].count_documents(
        {"project_id": project_id, "segment_id": segment_id}
    )
    return {**seg, "member_count": member_count}
