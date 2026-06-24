import asyncio
import json
from typing import Any

import structlog
from aiokafka import AIOKafkaProducer
from shared.clients.kafka import make_kafka_consumer, make_kafka_producer
from redis.asyncio import Redis
from shared.services.client import get_site_config

from app.config import settings
from app.writer import ClickHouseWriter

log = structlog.get_logger()

_MAX_RETRIES = 3
_UNKNOWN_TABLE = "__unknown__"


async def _resolve_table(
    event: dict[str, Any],
    redis: Redis,
    cache: dict[int, str],
) -> tuple[str, dict[str, Any]]:
    """Return (clickhouse_table, event) for a single event.

    Looks up site config by site_id (Redis-cached). Falls back to the event's
    own project_id if site config is unavailable. Injects the resolved table name
    as project_id into the event so the writer uses the correct value.
    """
    raw_site_id = event.get("site_id")
    if not raw_site_id:
        return str(event.get("project_id") or _UNKNOWN_TABLE), event

    site_id = int(raw_site_id)
    if site_id not in cache:
        cfg = await get_site_config(site_id, redis)
        if cfg:
            cache[site_id] = (
                cfg.configuration.get("clickhouse_table")
                or (str(cfg.project_id) if cfg.project_id else _UNKNOWN_TABLE)
            )
        else:
            cache[site_id] = _UNKNOWN_TABLE

    table = cache[site_id]
    if table != _UNKNOWN_TABLE:
        event = {**event, "project_id": table}
    return table, event
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


async def run_consumer(writer: ClickHouseWriter, redis: Redis) -> None:
    consumer = await make_kafka_consumer(
        [settings.kafka_events_topic],
        settings.kafka_bootstrap_servers,
        settings.kafka_consumer_group,
    )
    dlq_producer = await make_kafka_producer(
        settings.kafka_bootstrap_servers,
        acks="all",
    )
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

            # Group events by ClickHouse table name, resolved from site config.
            # Falls back to the event's own project_id if site config is unavailable.
            by_project: dict[str, list[dict[str, Any]]] = {}
            _site_table: dict[int, str] = {}
            for event in events:
                clickhouse_table, event = await _resolve_table(event, redis, _site_table)
                by_project.setdefault(clickhouse_table, []).append(event)

            # Write per project; collect failures across all groups before committing.
            all_failed: list[dict[str, Any]] = []
            for clickhouse_table, project_events in by_project.items():
                failed = await _write_with_retry(writer, clickhouse_table, project_events)
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
