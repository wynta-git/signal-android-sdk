"""Campaign execution: fan-out to segment members and emit per-user send jobs."""
import asyncio
import json
import uuid
from datetime import date, datetime, timezone
from typing import Any

import structlog
from aiokafka import AIOKafkaProducer
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app.config import settings
from shared.clients.mongo import (
    get_campaign,
    get_template,
    insert_campaign_run,
    update_campaign_run,
)
from shared.clients.redis import get_str, incr_with_expire, is_segment_member, stream_segment_members

log = structlog.get_logger()

_DAY_TTL = 25 * 3600
_TOTAL_TTL = 365 * 86400


# ---------------------------------------------------------------------------
# Audience + rate limit (inlined — not importable from campaign-engine)
# ---------------------------------------------------------------------------

async def _in_audience(audience: dict[str, Any], project_id: str, user_id: str, redis: Redis) -> bool:
    if audience.get("all"):
        return True
    segment_id = audience.get("segment_id")
    if not segment_id:
        return True
    return await is_segment_member(redis, project_id, segment_id, user_id)


def _day_key(campaign_id: str, user_id: str) -> str:
    today = date.today().strftime("%Y%m%d")
    return f"pam:campaign:daily:{campaign_id}:{user_id}:{today}"


def _total_key(campaign_id: str, user_id: str) -> str:
    return f"pam:campaign:total:{campaign_id}:{user_id}"


async def _rate_allowed(rate_limit: dict[str, Any], campaign_id: str, user_id: str, redis: Redis) -> bool:
    per_day = rate_limit.get("per_user_per_day", 1)
    day_str = await get_str(redis, _day_key(campaign_id, user_id))
    if int(day_str or 0) >= per_day:
        return False

    per_total = rate_limit.get("per_user_per_campaign_total")
    if per_total is not None:
        total_str = await get_str(redis, _total_key(campaign_id, user_id))
        if int(total_str or 0) >= per_total:
            return False

    return True


async def _mark_sent(rate_limit: dict[str, Any], campaign_id: str, user_id: str, redis: Redis) -> None:
    await incr_with_expire(redis, _day_key(campaign_id, user_id), _DAY_TTL)
    if rate_limit.get("per_user_per_campaign_total") is not None:
        await incr_with_expire(redis, _total_key(campaign_id, user_id), _TOTAL_TTL)


# ---------------------------------------------------------------------------
# Send job emission
# ---------------------------------------------------------------------------

async def _emit_send_job(
    producer: AIOKafkaProducer,
    *,
    campaign: dict[str, Any],
    run_id: str,
    user_id: str,
    deliver_at: datetime,
) -> None:
    brand_id = campaign.get("brand_id")
    brand_id = str(brand_id) if brand_id is not None else None

    job = {
        "send_id": str(uuid.uuid4()),
        "project_id": campaign["project_id"],
        "campaign_id": campaign["campaign_id"],
        "campaign_run_id": run_id,
        "user_id": user_id,
        "brand_id": brand_id,
        "channel": campaign["channel"],
        "template_id": campaign["template_id"],
        "trigger_type": campaign.get("trigger_type"),
        "expires_in_hours": campaign.get("expires_in_hours"),
        "context": {},
        "deliver_at": deliver_at.isoformat(),
    }
    await producer.send(
        settings.kafka_send_topic,
        key=user_id.encode(),
        value=json.dumps(job).encode(),
    )


# ---------------------------------------------------------------------------
# Main execution
# ---------------------------------------------------------------------------

async def run_campaign(
    *,
    campaign_id: str,
    project_id: str,
    run_id: str,
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    campaign = await get_campaign(db, project_id, campaign_id)
    if not campaign:
        log.error("sender.campaign_not_found", campaign_id=campaign_id, project_id=project_id)
        return

    template_id = campaign.get("template_id", "")
    template = await get_template(db, project_id, template_id)
    if not template:
        log.error(
            "sender.template_not_found",
            campaign_id=campaign_id,
            project_id=project_id,
            template_id=template_id,
        )
        return

    audience = campaign.get("audience") or {}
    rate_limit = campaign.get("rate_limit") or {"per_user_per_day": 1}
    segment_id = audience.get("segment_id") or ""
    now = datetime.now(timezone.utc)

    run_doc = {
        "run_id": run_id,
        "project_id": project_id,
        "campaign_id": campaign_id,
        "status": "running",
        "started_at": now,
        "completed_at": None,
        "sent_count": 0,
        "skipped_count": 0,
        "failed_count": 0,
    }
    await insert_campaign_run(db, run_doc)

    sent = 0
    skipped = 0
    failed = 0

    async def _process_user(user_id: str) -> str:
        try:
            if not await _in_audience(audience, project_id, user_id, redis):
                return "skipped"
            if not await _rate_allowed(rate_limit, campaign_id, user_id, redis):
                return "skipped"
            await _emit_send_job(
                producer,
                campaign=campaign,
                run_id=run_id,
                user_id=user_id,
                deliver_at=now,
            )
            await _mark_sent(rate_limit, campaign_id, user_id, redis)
            return "sent"
        except Exception:
            log.exception(
                "sender.user_failed",
                campaign_id=campaign_id,
                project_id=project_id,
                user_id=user_id,
                run_id=run_id,
            )
            return "failed"

    async for batch in stream_segment_members(redis, project_id, segment_id):
        results = await asyncio.gather(*[_process_user(uid) for uid in batch])
        sent += results.count("sent")
        skipped += results.count("skipped")
        failed += results.count("failed")

    await update_campaign_run(
        db,
        project_id,
        run_id,
        {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc),
            "sent_count": sent,
            "skipped_count": skipped,
            "failed_count": failed,
        },
    )
    log.info(
        "sender.run_complete",
        campaign_id=campaign_id,
        project_id=project_id,
        run_id=run_id,
        sent=sent,
        skipped=skipped,
        failed=failed,
    )
