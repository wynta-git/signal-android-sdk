import asyncio
import json
from typing import Any

import structlog
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from app.config import settings
from app.writer import ClickHouseWriter

log = structlog.get_logger()

_MAX_RETRIES = 3
_RETRY_BACKOFF = 1.0  # seconds, doubles each attempt


async def _write_with_retry(
    writer: ClickHouseWriter,
    project_id: str,
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Try to write a single project's batch; return events that failed after all retries."""
    for attempt in range(_MAX_RETRIES):
        try:
            await writer.write_batch(project_id, events)
            return []
        except Exception as exc:
            delay = _RETRY_BACKOFF * (2 ** attempt)
            log.warning(
                "ch_write_failed",
                project_id=project_id,
                attempt=attempt + 1,
                error=str(exc),
                retry_in=delay,
                count=len(events),
            )
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(delay)
    log.error("ch_write_exhausted", project_id=project_id, count=len(events))
    return events


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
            log.error("dlq_send_failed", error=str(exc), event_id=event.get("event_id"))
    try:
        await producer.flush()
    except Exception as exc:
        log.error("dlq_flush_failed", error=str(exc))


async def run_consumer(writer: ClickHouseWriter) -> None:
    consumer = AIOKafkaConsumer(
        settings.kafka_events_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
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
        "consumer_started",
        topic=settings.kafka_events_topic,
        group=settings.kafka_consumer_group,
    )

    try:
        while True:
            records = await consumer.getmany(
                timeout_ms=int(settings.batch_timeout_seconds * 1000),
                max_records=settings.batch_size,
            )

            events: list[dict[str, Any]] = []
            for messages in records.values():
                for msg in messages:
                    try:
                        events.append(json.loads(msg.value.decode()))
                    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                        log.warning("msg_decode_failed", offset=msg.offset, error=str(exc))

            if not events:
                continue

            # Group events by project_id so each client's batch goes to its own table.
            by_project: dict[str, list[dict[str, Any]]] = {}
            for event in events:
                pid = str(event.get("project_id") or "__unknown__")
                by_project.setdefault(pid, []).append(event)

            # Write per project; collect failures across all groups before committing.
            all_failed: list[dict[str, Any]] = []
            for pid, project_events in by_project.items():
                failed = await _write_with_retry(writer, pid, project_events)
                all_failed.extend(failed)

            if all_failed:
                await _send_to_dlq(dlq_producer, all_failed)

            # Commit only after every group is written (or DLQ'd) — at-least-once delivery.
            await consumer.commit()
            log.info("batch_processed", total=len(events), failed=len(all_failed))

    finally:
        await consumer.stop()
        await dlq_producer.stop()
        log.info("consumer_stopped")
