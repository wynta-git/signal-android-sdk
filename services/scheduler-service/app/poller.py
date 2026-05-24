import asyncio
import json
from datetime import datetime, timezone

import structlog
from aiokafka import AIOKafkaProducer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.models import ExecutionEvent
from shared.clients.mongo import lock_due_cron_campaign, lock_due_oneoff_campaign

log = structlog.get_logger()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _publish(producer: AIOKafkaProducer, event: ExecutionEvent) -> None:
    value = json.dumps(event.model_dump(mode="json")).encode()
    key = event.project_id.encode()
    await producer.send(settings.kafka_scheduler_topic, key=key, value=value)
    log.info(
        "poller.published",
        campaign_id=event.campaign_id,
        project_id=event.project_id,
        trigger_type=event.trigger_type,
        run_id=event.run_id,
    )


async def poll_once(db: AsyncIOMotorDatabase, producer: AIOKafkaProducer) -> None:
    now = _utcnow()
    for _ in range(settings.max_lock_batch):
        campaign = await lock_due_oneoff_campaign(db, now)
        if campaign:
            event = ExecutionEvent(
                campaign_id=campaign["campaign_id"],
                project_id=campaign["project_id"],
                trigger_type="one_off",
                fired_at=now,
            )
            await _publish(producer, event)

        campaign = await lock_due_cron_campaign(db, now)
        if campaign:
            event = ExecutionEvent(
                campaign_id=campaign["campaign_id"],
                project_id=campaign["project_id"],
                trigger_type="scheduled",
                fired_at=now,
            )
            await _publish(producer, event)


async def poll_loop(
    db: AsyncIOMotorDatabase,
    producer: AIOKafkaProducer,
    stop_event: asyncio.Event,
) -> None:
    log.info("poller.started", interval_seconds=settings.poll_interval_seconds)
    while not stop_event.is_set():
        try:
            await poll_once(db, producer)
        except Exception:
            log.exception("poller.error")
        await asyncio.sleep(settings.poll_interval_seconds)
    log.info("poller.stopped")
