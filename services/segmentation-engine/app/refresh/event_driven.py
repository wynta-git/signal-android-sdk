import asyncio
import json

import structlog
from aiokafka import AIOKafkaConsumer
from clickhouse_connect.driver.asyncclient import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app import storage
from app.config import settings
from app.dsl.validator import SegmentRule
from app.refresh.engine import evaluate_user_for_segment

log = structlog.get_logger()


async def run_consumer(
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    redis: Redis,
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
                    await _handle_message(msg.value, db, ch, redis)

            await consumer.commit()
    except asyncio.CancelledError:
        pass
    finally:
        await consumer.stop()
        log.info("event_consumer.stopped")


async def _handle_message(
    event: dict,
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    redis: Redis,
) -> None:
    project_id = event.get("project_id")
    user_id = event.get("user_id")
    event_name = event.get("event_name")

    if not (project_id and user_id and event_name):
        return

    segments = await storage.list_on_event_segments(db, project_id, event_name)
    if not segments:
        return

    log.debug(
        "event_consumer.evaluating",
        project_id=project_id,
        user_id=user_id,
        event_name=event_name,
        segment_count=len(segments),
    )

    for seg in segments:
        try:
            rule = SegmentRule.model_validate(seg["rule"])
            await evaluate_user_for_segment(
                project_id=project_id,
                segment_id=seg["segment_id"],
                user_id=user_id,
                rule=rule,
                db=db,
                ch=ch,
                redis=redis,
                brand_id=seg.get("brand_id"),
            )
        except Exception:
            log.exception(
                "event_consumer.eval_failed",
                project_id=project_id,
                segment_id=seg["segment_id"],
                user_id=user_id,
            )
