from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_db
from motor.motor_asyncio import AsyncIOMotorDatabase
from shared.clients.mongo import get_campaign, list_campaigns, list_campaign_runs

router = APIRouter(prefix="/v1/admin/projects/{project_id}/campaigns", tags=["admin"])

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]


@router.get("")
async def list_campaigns_admin(
    project_id: str,
    db: DbDep,
    status: str | None = None,
) -> list[dict[str, Any]]:
    return await list_campaigns(db, project_id, status=status)


@router.get("/{campaign_id}")
async def get_campaign_admin(
    project_id: str,
    campaign_id: str,
    db: DbDep,
) -> dict[str, Any]:
    doc = await get_campaign(db, project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    runs = await list_campaign_runs(db, project_id, campaign_id)
    return {**doc, "runs": runs}
