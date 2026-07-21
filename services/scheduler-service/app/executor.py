import asyncio
import json
from datetime import datetime, timezone

import structlog
from aiokafka import AIOKafkaProducer
from shared.clients.kafka import make_kafka_consumer
from croniter import croniter
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app.config import settings
from app.models import ExecutionEvent
from app.sender import run_campaign, run_campaign_grouped
from shared.clients.mongo import (
    complete_oneoff_campaign,
    get_campaign,
    get_campaign_run_by_run_id,
    increment_retry_count,
    reset_cron_campaign,
)

log = structlog.get_logger()

# Channels whose provider can batch many recipients into one API call — these
# use the grouped fan-out path (run_campaign_grouped) instead of one SendJob
# per user. Push/in_app are not in this set and keep using run_campaign
# unchanged.
_GROUPED_CHANNELS = {"email", "sms", "whatsapp", "telegram"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _next_cron_run(cron: str, base: datetime) -> datetime:
    return croniter(cron, base).get_next(datetime)


async def _send_to_dlq(
    dlq_producer: AIOKafkaProducer,
    event: ExecutionEvent,
    reason: str,
) -> None:
    payload = {**event.model_dump(mode="json"), "dlq_reason": reason}
    await dlq_producer.send(
        settings.kafka_dlq_topic,
        key=event.project_id.encode(),
        value=json.dumps(payload).encode(),
    )
    log.error(
        "executor.dlq",
        campaign_id=event.campaign_id,
        project_id=event.project_id,
        run_id=event.run_id,
        reason=reason,
    )


async def handle_execution(
    event: ExecutionEvent,
    db: AsyncIOMotorDatabase,
    redis: Redis,
    send_producer: AIOKafkaProducer,
    dlq_producer: AIOKafkaProducer,
) -> bool:
    """Execute a campaign. Returns True on success, False on failure (caller skips commit)."""
    campaign_id = event.campaign_id
    project_id = event.project_id
    run_id = event.run_id

    # 1. Cancellation / status guard — re-read from MongoDB
    campaign = await get_campaign(db, project_id, campaign_id)
    if not campaign:
        log.warning("executor.campaign_missing", campaign_id=campaign_id, project_id=project_id, run_id=run_id)
        return True  # nothing to do, commit and move on

    status = campaign.get("status")
    if status in ("paused", "cancelled", "completed"):
        log.info(
            "executor.skipped",
            campaign_id=campaign_id,
            project_id=project_id,
            run_id=run_id,
            status=status,
        )
        # Reset the lock so the campaign stays clean
        if status in ("paused", "cancelled"):
            from shared.clients.mongo import update_campaign
            await update_campaign(db, project_id, campaign_id, {"picked": False, "picked_at": None})
        return True

    # 2. Idempotency — skip if this run_id already completed
    existing_run = await get_campaign_run_by_run_id(db, run_id)
    if existing_run and existing_run.get("status") == "completed":
        log.info("executor.duplicate_skipped", campaign_id=campaign_id, run_id=run_id)
        return True

    # 3. Execute — grouped fan-out for batchable channels, unchanged per-user
    # fan-out for everything else (push/in_app).
    try:
        run_fn = run_campaign_grouped if campaign.get("channel") in _GROUPED_CHANNELS else run_campaign
        await run_fn(
            campaign_id=campaign_id,
            project_id=project_id,
            run_id=run_id,
            db=db,
            redis=redis,
            producer=send_producer,
        )
    except Exception:
        log.exception(
            "executor.run_failed",
            campaign_id=campaign_id,
            project_id=project_id,
            run_id=run_id,
        )
        new_count = await increment_retry_count(db, project_id, campaign_id)
        if new_count >= settings.max_retry_count:
            await _send_to_dlq(dlq_producer, event, reason="max_retries_exceeded")
            # Reset picked so campaign doesn't stay permanently locked
            from shared.clients.mongo import update_campaign
            await update_campaign(db, project_id, campaign_id, {"picked": False, "picked_at": None})
            return True  # commit — we've sent to DLQ, no point redelivering
        return False  # skip commit → Kafka redelivers

    # 4. Post-execution state update
    now = _utcnow()
    if event.trigger_type in ("one_off", "immediate"):
        await complete_oneoff_campaign(db, project_id, campaign_id)
    else:
        cron = campaign.get("trigger", {}).get("cron", "")
        next_run_at = _next_cron_run(cron, now)
        await reset_cron_campaign(db, project_id, campaign_id, next_run_at)

    log.info(
        "executor.success",
        campaign_id=campaign_id,
        project_id=project_id,
        run_id=run_id,
        trigger_type=event.trigger_type,
    )
    return True


async def executor_loop(
    db: AsyncIOMotorDatabase,
    redis: Redis,
    send_producer: AIOKafkaProducer,
    dlq_producer: AIOKafkaProducer,
    stop_event: asyncio.Event,
) -> None:
    consumer = await make_kafka_consumer(
        [settings.kafka_scheduler_topic],
        settings.kafka_bootstrap_servers,
        settings.kafka_consumer_group,
        sasl_username=settings.kafka_sasl_username,
        sasl_password=settings.kafka_sasl_password,
        value_deserializer=lambda b: b,
    )
    log.info("executor.started", topic=settings.kafka_scheduler_topic)

    try:
        while not stop_event.is_set():
            batch = await consumer.getmany(timeout_ms=2000, max_records=20)
            all_succeeded = True
            for _tp, messages in batch.items():
                for msg in messages:
                    try:
                        event = ExecutionEvent.model_validate_json(msg.value)
                    except Exception:
                        log.exception("executor.parse_error", raw=msg.value[:200])
                        continue
                    success = await handle_execution(event, db, redis, send_producer, dlq_producer)
                    if not success:
                        all_succeeded = False
                        break  # stop processing this partition batch; redelivery will retry
                if not all_succeeded:
                    break
            if all_succeeded:
                await consumer.commit()
    finally:
        await consumer.stop()
        log.info("executor.stopped")
