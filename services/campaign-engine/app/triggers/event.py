import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app.audience import is_in_audience
from app.config import settings
from app.models import Campaign, CampaignRun
from app.rate_limit import check_rate_limit, mark_sent
from app.sender import emit_send_job
from shared.clients.mongo import (
    get_active_campaign_run,
    get_running_campaigns_for_event,
    increment_campaign_run_sent,
    insert_campaign_run,
)

log = structlog.get_logger()


async def run_consumer(
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
    stop_event: asyncio.Event,
) -> None:
    consumer = AIOKafkaConsumer(
        settings.kafka_events_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        auto_offset_reset="latest",
        enable_auto_commit=False,
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
    )
    await consumer.start()
    log.info("event_consumer.started", topic=settings.kafka_events_topic)

    try:
        while not stop_event.is_set():
            batch = await consumer.getmany(timeout_ms=2000, max_records=100)
            if not batch:
                continue
            for _tp, messages in batch.items():
                for msg in messages:
                    await _handle_event(msg.value, db, redis, producer)
            await consumer.commit()
    except asyncio.CancelledError:
        pass
    finally:
        await consumer.stop()
        log.info("event_consumer.stopped")


async def _handle_event(
    event: dict[str, Any],
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    project_id = event.get("project_id")
    user_id = event.get("user_id")
    event_name = event.get("event_name")

    if not (project_id and user_id and event_name):
        return

    campaigns = await get_running_campaigns_for_event(db, project_id, event_name)
    if not campaigns:
        return

    for camp_doc in campaigns:
        try:
            campaign = Campaign.model_validate(camp_doc)
            await _process_for_user(
                campaign=campaign,
                user_id=user_id,
                event_id=event.get("event_id"),
                event_properties=event.get("properties", {}),
                db=db,
                redis=redis,
                producer=producer,
            )
        except Exception:
            log.exception(
                "event_consumer.process_failed",
                project_id=project_id,
                campaign_id=camp_doc.get("campaign_id"),
                user_id=user_id,
                event_id=event.get("event_id"),
            )


async def _process_for_user(
    *,
    campaign: Campaign,
    user_id: str,
    event_id: str | None,
    event_properties: dict[str, Any],
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    in_audience = await is_in_audience(campaign.audience, campaign.project_id, user_id, db, redis)
    if not in_audience:
        return

    allowed = await check_rate_limit(campaign, user_id, redis)
    if not allowed:
        log.debug(
            "event_consumer.rate_limited",
            project_id=campaign.project_id,
            campaign_id=campaign.campaign_id,
            user_id=user_id,
        )
        return

    now = datetime.now(timezone.utc)
    deliver_at = now + timedelta(minutes=campaign.delay.minutes) if campaign.delay else now

    run_id = await _get_or_create_run_id(campaign, db)
    await emit_send_job(
        producer,
        campaign=campaign,
        campaign_run_id=run_id,
        user_id=user_id,
        deliver_at=deliver_at,
        context={"event_id": event_id, "event_properties": event_properties},
    )
    await mark_sent(campaign, user_id, redis)
    await increment_campaign_run_sent(db, campaign.project_id, run_id)


async def _get_or_create_run_id(campaign: Campaign, db: AsyncIOMotorDatabase) -> str:
    existing = await get_active_campaign_run(db, campaign.project_id, campaign.campaign_id)
    if existing:
        return existing["run_id"]

    run = CampaignRun(project_id=campaign.project_id, campaign_id=campaign.campaign_id)
    await insert_campaign_run(db, run.model_dump(mode="json"))
    return run.run_id
