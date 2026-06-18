import asyncio
import json
from typing import Any

import structlog
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from redis.asyncio import Redis

from app.config import settings
from app.bonus_event_processor.processor import process_bonus_event

log = structlog.get_logger()

_MAX_RETRIES = 3
_RETRY_BACKOFF = 1.0  # seconds, doubles each attempt


async def _process_with_retry(redis: Redis, event: dict[str, Any]) -> bool:
    """Try to process a single event; return False after all retries exhausted."""
    for attempt in range(_MAX_RETRIES):
        try:
            await process_bonus_event(redis, event)
            return True
        except Exception as exc:
            delay = _RETRY_BACKOFF * (2 ** attempt)
            log.warning(
                "bonus_event_process_failed",
                attempt=attempt + 1,
                error=str(exc),
                retry_in=delay,
                event_id=event.get("event_id"),
                user_id=event.get("user_id"),
            )
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(delay)
    log.error("bonus_event_exhausted", event_id=event.get("event_id"), user_id=event.get("user_id"))
    return False


async def _send_to_dlq(
    producer: AIOKafkaProducer,
    events: list[dict[str, Any]],
) -> None:
    for event in events:
        try:
            await producer.send(
                settings.kafka_dlq_topic,
                key=(event.get("user_id") or "").encode(),
                value=json.dumps(event).encode(),
            )
        except Exception as exc:
            log.error("bonus_dlq_send_failed", error=str(exc), event_id=event.get("event_id"))
    try:
        await producer.flush()
    except Exception as exc:
        log.error("bonus_dlq_flush_failed", error=str(exc))


async def run_consumer(redis: Redis) -> None:
    consumer = AIOKafkaConsumer(
        settings.kafka_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_group_id,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
    )
    dlq_producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        acks="all",
    )

    await consumer.start()
    await dlq_producer.start()
    log.info(
        "bonus_consumer_started",
        topic=settings.kafka_topic,
        group=settings.kafka_group_id,
    )

    try:
        while True:
            records = await consumer.getmany(
                timeout_ms=settings.kafka_batch_timeout_ms,
                max_records=settings.kafka_batch_size,
            )

            events: list[dict[str, Any]] = []
            for messages in records.values():
                for msg in messages:
                    try:
                        events.append(json.loads(msg.value.decode()))
                    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                        log.warning("bonus_msg_decode_failed", offset=msg.offset, error=str(exc))

            if not events:
                continue

            failed: list[dict[str, Any]] = []
            for event in events:
                success = await _process_with_retry(redis, event)
                if not success:
                    failed.append(event)

            if failed:
                await _send_to_dlq(dlq_producer, failed)

            await consumer.commit()
            log.info("bonus_batch_processed", total=len(events), failed=len(failed))

    finally:
        await consumer.stop()
        await dlq_producer.stop()
        log.info("bonus_consumer_stopped")
