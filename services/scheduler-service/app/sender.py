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
    get_project_batch_size_overrides,
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
        "target_screens": campaign.get("target_screens"),
        "target_events": campaign.get("target_events"),
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


# ---------------------------------------------------------------------------
# Grouped send job emission — for channels whose provider batches many
# recipients into one API call (email now; sms/whatsapp/telegram later).
# Grouping happens here, upstream of Kafka, so batch quality is independent of
# unrelated concurrent campaign traffic on the platform. Personalization is
# NOT done here — this only ever accumulates and emits bare user_ids; the
# actual template rendering/personalization happens in notifications-engine.
# ---------------------------------------------------------------------------

_CHANNEL_BATCH_SIZE_SETTINGS: dict[str, str] = {
    "email": "batch_size_email",
    "sms": "batch_size_sms",
    "whatsapp": "batch_size_whatsapp",
}

_CHANNEL_GROUPED_TOPIC: dict[str, str] = {
    "email": settings.kafka_send_topic_grouped_email,
}


def _resolve_batch_size(channel: str, overrides: dict[str, int]) -> int:
    if channel in overrides:
        return overrides[channel]
    attr = _CHANNEL_BATCH_SIZE_SETTINGS.get(channel)
    if attr:
        return int(getattr(settings, attr))
    return settings.batch_size_default


async def _emit_grouped_send_job(
    producer: AIOKafkaProducer,
    *,
    campaign: dict[str, Any],
    run_id: str,
    user_ids: list[str],
    deliver_at: datetime,
    topic: str,
) -> None:
    brand_id = campaign.get("brand_id")
    brand_id = str(brand_id) if brand_id is not None else None

    job = {
        "send_id": str(uuid.uuid4()),
        "project_id": campaign["project_id"],
        "campaign_id": campaign["campaign_id"],
        "campaign_run_id": run_id,
        "user_ids": user_ids,
        "brand_id": brand_id,
        "channel": campaign["channel"],
        "template_id": campaign["template_id"],
        "context": {},
        "deliver_at": deliver_at.isoformat(),
    }
    await producer.send(
        topic,
        key=campaign["campaign_id"].encode(),
        value=json.dumps(job).encode(),
    )


async def _process_user_grouped(
    user_id: str,
    *,
    audience: dict[str, Any],
    rate_limit: dict[str, Any],
    campaign_id: str,
    project_id: str,
    redis: Redis,
) -> tuple[str, str | None]:
    """Same audience/rate-limit gating as _process_user, but returns the
    user_id to accumulate into a group instead of emitting immediately."""
    try:
        if not await _in_audience(audience, project_id, user_id, redis):
            return "skipped", None
        if not await _rate_allowed(rate_limit, campaign_id, user_id, redis):
            return "skipped", None
        await _mark_sent(rate_limit, campaign_id, user_id, redis)
        return "sent", user_id
    except Exception:
        log.exception(
            "sender.user_failed",
            campaign_id=campaign_id,
            project_id=project_id,
            user_id=user_id,
        )
        return "failed", None


async def run_campaign_grouped(
    *,
    campaign_id: str,
    project_id: str,
    run_id: str,
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    """Channel-agnostic grouped fan-out. Same campaign lookup, audience checks,
    and rate limiting as run_campaign — the only difference is that passing
    user_ids are accumulated and emitted as one GroupedSendJob per batch,
    instead of one SendJob per user. A campaign always has exactly one
    project_id/brand_id/template_id, so every group is homogeneous by
    construction — no bucketing/regrouping is ever needed downstream."""
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

    channel = campaign["channel"]
    topic = _CHANNEL_GROUPED_TOPIC.get(channel)
    if not topic:
        log.error("sender.no_grouped_topic_for_channel", channel=channel, campaign_id=campaign_id)
        return

    overrides = await get_project_batch_size_overrides(db, project_id)
    group_size = _resolve_batch_size(channel, overrides)

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
    pending: list[str] = []

    async def _flush(user_ids: list[str]) -> None:
        if not user_ids:
            return
        await _emit_grouped_send_job(
            producer,
            campaign=campaign,
            run_id=run_id,
            user_ids=user_ids,
            deliver_at=now,
            topic=topic,
        )

    async for batch in stream_segment_members(redis, project_id, segment_id):
        results = await asyncio.gather(*[
            _process_user_grouped(
                uid,
                audience=audience,
                rate_limit=rate_limit,
                campaign_id=campaign_id,
                project_id=project_id,
                redis=redis,
            )
            for uid in batch
        ])
        for status, uid in results:
            if status == "sent" and uid is not None:
                sent += 1
                pending.append(uid)
            elif status == "skipped":
                skipped += 1
            else:
                failed += 1

        while len(pending) >= group_size:
            await _flush(pending[:group_size])
            pending = pending[group_size:]

    await _flush(pending)

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
        "sender.grouped_run_complete",
        campaign_id=campaign_id,
        project_id=project_id,
        run_id=run_id,
        sent=sent,
        skipped=skipped,
        failed=failed,
        group_size=group_size,
    )
