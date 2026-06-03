import uuid
from datetime import datetime, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

import structlog
from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException

from app.cron_builder import build_cron
from app.dependencies import PortalAuthDep, get_db
from app.models import CreateCampaignRequest, UpdateCampaignRequest
from app.prefetch import trigger_segment_refresh
from motor.motor_asyncio import AsyncIOMotorDatabase
from shared.clients.mongo import (
    delete_campaign,
    get_campaign,
    get_template,
    insert_campaign,
    insert_template,
    list_campaigns,
    update_campaign,
)

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1/campaign/projects/{project_id}", tags=["campaigns"])

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]


def _next_cron_run(cron: str, base: datetime) -> datetime:
    return croniter(cron, base).get_next(datetime)


@router.post("", status_code=201)
async def create_campaign(
    ctx: PortalAuthDep,
    body: CreateCampaignRequest,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    campaign_id = f"camp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    # --- Map trigger to internal format ---
    trigger_dict: dict
    if body.trigger.type == "event":
        trigger_dict = {"type": "event", "event_name": body.trigger.event_name}
    else:
        sch = body.trigger.schedule  # guaranteed non-None by TriggerInput validator
        if sch.type == "immediate":
            trigger_dict = {"type": "immediate"}
        elif sch.type == "once":
            tz = ZoneInfo(sch.timezone)
            h, m = map(int, sch.schedule_time.split(":"))  # type: ignore[union-attr]
            send_dt = datetime(
                sch.start_date.year, sch.start_date.month, sch.start_date.day,  # type: ignore[union-attr]
                h, m, tzinfo=tz,
            )
            trigger_dict = {"type": "one_off", "send_at": send_dt.astimezone(timezone.utc).isoformat()}
        else:
            trigger_dict = {
                "type": "scheduled",
                "schedule": sch.model_dump(mode="json"),
                "cron": build_cron(sch),  # type: ignore[arg-type]
            }

    # --- Resolve template ---
    channel_type = body.channel.type
    template_id = body.channel.template_id
    if not template_id:
        msg = body.channel.message  # guaranteed non-None by ChannelConfig validator
        template_id = f"tmpl_{uuid.uuid4().hex[:12]}"
        inline_body: dict = {"title": msg.title, "body": msg.body}  # type: ignore[union-attr]
        if msg.deep_link:  # type: ignore[union-attr]
            inline_body["deep_link"] = msg.deep_link  # type: ignore[union-attr]
        await insert_template(db, {
            "template_id": template_id,
            "project_id": project_id,
            "name": f"{body.name} (inline)",
            "channel": channel_type,
            "body": inline_body,
            "created_at": now,
            "updated_at": now,
        })

    # --- Map delivery ---
    dlv = body.delivery
    auto_dismiss_seconds = dlv.auto_dismiss.dismiss_after_seconds if dlv.auto_dismiss else None

    doc = {
        "campaign_id": campaign_id,
        "project_id": project_id,
        "name": body.name,
        "tags": body.tags,
        "objective": body.objective,
        "status": "draft",
        "trigger": trigger_dict,
        "audience": body.audience.model_dump(mode="json"),
        "channel": channel_type,
        "template_id": template_id,
        "rate_limit": dlv.rate_limit.model_dump(mode="json"),
        "delay": dlv.delay.model_dump(mode="json") if dlv.delay else None,
        "min_delay_between_sends_minutes": dlv.min_delay_between_sends_minutes,
        "ignore_global_min_delay": dlv.ignore_global_min_delay,
        "auto_dismiss_seconds": auto_dismiss_seconds,
        "created_at": now,
        "updated_at": now,
        # Scheduler fields — managed by scheduler-service
        "picked": False,
        "picked_at": None,
        "next_run_at": None,
        "retry_count": 0,
    }
    await insert_campaign(db, doc)
    log.info("campaign.created", project_id=project_id, campaign_id=campaign_id)
    return {"campaign_id": campaign_id}


@router.get("")
async def list_campaigns_route(
    ctx: PortalAuthDep,
    db: DbDep,
    status: str | None = None,
) -> list[dict]:
    return await list_campaigns(db, ctx.project_id, status=status)


@router.get("/{campaign_id}")
async def get_campaign_route(
    ctx: PortalAuthDep,
    campaign_id: str,
    db: DbDep,
) -> dict:
    doc = await get_campaign(db, ctx.project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if template_id := doc.get("template_id"):
        template = await get_template(db, ctx.project_id, template_id)
        if template:
            doc["message"] = template.get("body", {})
    return doc


@router.patch("/{campaign_id}")
async def update_campaign_route(
    ctx: PortalAuthDep,
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

    now = datetime.now(timezone.utc)
    updates: dict = {}

    if body.name is not None:
        updates["name"] = body.name
    if body.tags is not None:
        updates["tags"] = body.tags
    if body.objective is not None:
        updates["objective"] = body.objective
    if body.audience is not None:
        updates["audience"] = body.audience.model_dump(mode="json")

    if body.channel is not None:
        ch = body.channel
        if ch.template_id:
            updates["template_id"] = ch.template_id
        elif ch.message:
            template_id = f"tmpl_{uuid.uuid4().hex[:12]}"
            await insert_template(db, {
                "template_id": template_id,
                "project_id": project_id,
                "name": f"{doc['name']} (inline)",
                "channel": doc["channel"],
                "body": {
                    "title": ch.message.title,
                    "body": ch.message.body,
                    **({"deep_link": ch.message.deep_link} if ch.message.deep_link else {}),
                },
                "created_at": now,
                "updated_at": now,
            })
            updates["template_id"] = template_id

    if body.delivery is not None:
        dlv = body.delivery
        updates["rate_limit"] = dlv.rate_limit.model_dump(mode="json")
        updates["delay"] = dlv.delay.model_dump(mode="json") if dlv.delay else None
        updates["min_delay_between_sends_minutes"] = dlv.min_delay_between_sends_minutes
        updates["ignore_global_min_delay"] = dlv.ignore_global_min_delay
        updates["auto_dismiss_seconds"] = (
            dlv.auto_dismiss.dismiss_after_seconds if dlv.auto_dismiss else None
        )

    if not updates:
        return doc

    ok = await update_campaign(db, project_id, campaign_id, updates)
    if not ok:
        raise HTTPException(status_code=404, detail="Campaign not found")

    updated = await get_campaign(db, project_id, campaign_id)
    return updated or {}


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign_route(
    ctx: PortalAuthDep,
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
    ctx: PortalAuthDep,
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
    now = datetime.now(timezone.utc)
    updates: dict = {}

    if trigger_type == "one_off":
        send_at = doc["trigger"].get("send_at")
        if not send_at:
            raise HTTPException(status_code=422, detail="one_off campaign requires trigger.send_at")
        updates["status"] = "scheduled"

    elif trigger_type == "immediate":
        updates["status"] = "running"
        updates["next_run_at"] = now

    elif trigger_type == "scheduled":
        cron = doc["trigger"].get("cron")
        if not cron:
            raise HTTPException(status_code=422, detail="scheduled campaign requires trigger.cron")
        if not croniter.is_valid(cron):
            raise HTTPException(status_code=422, detail=f"Invalid cron expression: {cron}")
        updates["status"] = "running"
        # Respect start_date: don't schedule first run before it
        schedule = doc["trigger"].get("schedule") or {}
        start_date_str = schedule.get("start_date")
        base = now
        if start_date_str:
            from datetime import date
            sd = date.fromisoformat(start_date_str)
            start_dt = datetime(sd.year, sd.month, sd.day, tzinfo=timezone.utc)
            if start_dt > now:
                base = start_dt
        updates["next_run_at"] = _next_cron_run(cron, base)

    else:
        updates["status"] = "running"

    await update_campaign(db, project_id, campaign_id, updates)
    log.info(
        "campaign.activated",
        project_id=project_id,
        campaign_id=campaign_id,
        status=updates["status"],
    )

    segment_id = (doc.get("audience") or {}).get("segment_id", "")
    if segment_id:
        await trigger_segment_refresh(project_id, segment_id)

    return {"status": updates["status"]}


@router.post("/{campaign_id}/pause", status_code=200)
async def pause_campaign(
    ctx: PortalAuthDep,
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
    log.info("campaign.paused", project_id=project_id, campaign_id=campaign_id)
    return {"status": "paused"}


@router.post("/{campaign_id}/resume", status_code=200)
async def resume_campaign(
    ctx: PortalAuthDep,
    campaign_id: str,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    doc = await get_campaign(db, project_id, campaign_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if doc["status"] != "paused":
        raise HTTPException(status_code=409, detail="Only paused campaigns can be resumed")

    updates: dict = {"status": "running"}

    if doc["trigger"]["type"] == "scheduled":
        cron = doc["trigger"].get("cron", "")
        now = datetime.now(timezone.utc)
        updates["next_run_at"] = _next_cron_run(cron, now)
        updates["picked"] = False
        updates["picked_at"] = None

    await update_campaign(db, project_id, campaign_id, updates)
    log.info("campaign.resumed", project_id=project_id, campaign_id=campaign_id)
    return {"status": "running"}


@router.post("/{campaign_id}/cancel", status_code=200)
async def cancel_campaign(
    ctx: PortalAuthDep,
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
    log.info("campaign.cancelled", project_id=project_id, campaign_id=campaign_id)
    return {"status": "cancelled"}
