import uuid
from datetime import datetime, timezone
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.dependencies import AuthDep, get_db, get_producer
from app.models import Campaign, CreateCampaignRequest, UpdateCampaignRequest
from app.triggers import scheduled as scheduler
from motor.motor_asyncio import AsyncIOMotorDatabase
from aiokafka import AIOKafkaProducer
from shared.clients.mongo import (
    delete_campaign,
    get_campaign,
    insert_campaign,
    list_campaigns,
    update_campaign,
)

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1/campaign/projects/{project_id}", tags=["campaigns"])

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]
ProducerDep = Annotated[AIOKafkaProducer, Depends(get_producer)]


@router.post("", status_code=201)
async def create_campaign(
    ctx: AuthDep,
    body: CreateCampaignRequest,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    campaign_id = f"camp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    doc = {
        "campaign_id": campaign_id,
        "project_id": project_id,
        "name": body.name,
        "status": "draft",
        "trigger": body.trigger.model_dump(mode="json"),
        "audience": body.audience.model_dump(mode="json"),
        "channel": body.channel,
        "template_id": body.template_id,
        "rate_limit": body.rate_limit.model_dump(mode="json"),
        "delay": body.delay.model_dump(mode="json") if body.delay else None,
        "created_at": now,
        "updated_at": now,
    }
    await insert_campaign(db, doc)
    log.info("campaign.created", project_id=project_id, campaign_id=campaign_id)
    return {"campaign_id": campaign_id}


@router.get("")
async def list_campaigns_route(
    ctx: AuthDep,
    db: DbDep,
    status: str | None = None,
) -> list[dict]:
    return await list_campaigns(db, ctx.project_id, status=status)


@router.get("/{campaign_id}")
async def get_campaign_route(
    ctx: AuthDep,
    campaign_id: str,
    db: DbDep,
) -> dict:
    doc = await get_campaign(db, ctx.project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return doc


@router.patch("/{campaign_id}")
async def update_campaign_route(
    ctx: AuthDep,
    campaign_id: str,
    body: UpdateCampaignRequest,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    doc = await get_campaign(db, project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if doc["status"] != "draft":
        raise HTTPException(status_code=409, detail="Only draft campaigns can be edited")

    updates = body.model_dump(exclude_none=True, mode="json")
    if not updates:
        return doc

    ok = await update_campaign(db, project_id, campaign_id, updates)
    if not ok:
        raise HTTPException(status_code=404, detail="Campaign not found")

    updated = await get_campaign(db, project_id, campaign_id)
    return updated or {}


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign_route(
    ctx: AuthDep,
    campaign_id: str,
    db: DbDep,
) -> None:
    project_id = ctx.project_id
    doc = await get_campaign(db, project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if doc["status"] not in ("draft", "cancelled"):
        raise HTTPException(
            status_code=409, detail="Only draft or cancelled campaigns can be deleted"
        )
    await delete_campaign(db, project_id, campaign_id)


@router.post("/{campaign_id}/activate", status_code=200)
async def activate_campaign(
    ctx: AuthDep,
    campaign_id: str,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    doc = await get_campaign(db, project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if doc["status"] != "draft":
        raise HTTPException(status_code=409, detail="Only draft campaigns can be activated")

    trigger_type = doc["trigger"]["type"]

    if trigger_type == "one_off":
        send_at = doc["trigger"].get("send_at")
        if not send_at:
            raise HTTPException(status_code=422, detail="one_off campaign requires trigger.send_at")
        new_status = "scheduled"
    else:
        new_status = "running"

    await update_campaign(db, project_id, campaign_id, {"status": new_status})

    if trigger_type == "scheduled":
        campaign = Campaign.model_validate({**doc, "status": new_status})
        scheduler.register_campaign(campaign, db)

    if trigger_type == "one_off":
        campaign = Campaign.model_validate({**doc, "status": new_status})
        scheduler.register_oneoff_prefetch(campaign)

    log.info("campaign.activated", project_id=project_id, campaign_id=campaign_id, status=new_status)
    return {"status": new_status}


@router.post("/{campaign_id}/pause", status_code=200)
async def pause_campaign(
    ctx: AuthDep,
    campaign_id: str,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    doc = await get_campaign(db, project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if doc["status"] != "running":
        raise HTTPException(status_code=409, detail="Only running campaigns can be paused")

    await update_campaign(db, project_id, campaign_id, {"status": "paused"})

    if doc["trigger"]["type"] == "scheduled":
        scheduler.unregister_campaign(project_id, campaign_id)

    log.info("campaign.paused", project_id=project_id, campaign_id=campaign_id)
    return {"status": "paused"}


@router.post("/{campaign_id}/resume", status_code=200)
async def resume_campaign(
    ctx: AuthDep,
    campaign_id: str,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    doc = await get_campaign(db, project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if doc["status"] != "paused":
        raise HTTPException(status_code=409, detail="Only paused campaigns can be resumed")

    await update_campaign(db, project_id, campaign_id, {"status": "running"})

    if doc["trigger"]["type"] == "scheduled":
        campaign = Campaign.model_validate({**doc, "status": "running"})
        scheduler.register_campaign(campaign, db)

    log.info("campaign.resumed", project_id=project_id, campaign_id=campaign_id)
    return {"status": "running"}


@router.post("/{campaign_id}/cancel", status_code=200)
async def cancel_campaign(
    ctx: AuthDep,
    campaign_id: str,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    doc = await get_campaign(db, project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if doc["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Campaign is already finished")

    await update_campaign(db, project_id, campaign_id, {"status": "cancelled"})

    if doc["trigger"]["type"] == "scheduled":
        scheduler.unregister_campaign(project_id, campaign_id)

    if doc["trigger"]["type"] == "one_off":
        scheduler.unregister_oneoff_prefetch(project_id, campaign_id)

    log.info("campaign.cancelled", project_id=project_id, campaign_id=campaign_id)
    return {"status": "cancelled"}
