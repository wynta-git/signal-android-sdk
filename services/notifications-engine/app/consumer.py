"""Kafka consumer: batch-process send jobs with asyncio.gather for concurrent delivery."""

import asyncio
import hashlib
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from aiokafka import AIOKafkaProducer, ConsumerRecord
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis
from shared.clients.kafka import KafkaConsumer
from shared.clients.mongo import (
    get_template,
    get_user,
    get_user_device_tokens,
    insert_notification_delivery,
    insert_notification_inbox,
)

from app.circuit_breaker import get_breaker
from app.config import settings
from app.models import DeliveryEvent, SendJob
from app.providers.base import Recipient, RenderedPayload
from app.providers.push import get_push_provider
from app.renderer import TemplateRenderError, render_in_app, render_push
from app.suppression import is_suppressed

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Template LRU cache  (per-pod, in-memory, TTL-based)
# ---------------------------------------------------------------------------

_template_cache: dict[str, tuple[dict[str, Any], float]] = {}  # key → (doc, expires_at)


async def _get_cached_template(
    db: AsyncIOMotorDatabase, project_id: str, template_id: str
) -> dict[str, Any] | None:
    key = f"{project_id}:{template_id}"
    entry = _template_cache.get(key)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    doc = await get_template(db, project_id, template_id)
    if doc:
        _template_cache[key] = (doc, time.monotonic() + settings.template_cache_ttl_seconds)
    return doc


# ---------------------------------------------------------------------------
# Per-job handler
# ---------------------------------------------------------------------------


async def _emit_delivery_event(producer: AIOKafkaProducer, event: DeliveryEvent) -> None:
    await producer.send(
        settings.kafka_delivery_topic,
        key=event.user_id.encode(),
        value=event.model_dump_json().encode(),
    )


async def handle_send_job(
    job: SendJob,
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    structlog.contextvars.bind_contextvars(
        send_id=job.send_id,
        user_id=job.user_id,
        campaign_id=job.campaign_id,
        project_id=job.project_id,
    )
    now = datetime.now(UTC)

    # 1. Suppression check
    if await is_suppressed(redis, job.project_id, job.user_id):
        log.info("consumer.suppressed")
        delivery_doc = {
            "send_id": job.send_id,
            "token_hash": "",
            "project_id": job.project_id,
            "campaign_id": job.campaign_id,
            "campaign_run_id": job.campaign_run_id,
            "user_id": job.user_id,
            "channel": job.channel,
            "status": "suppressed",
            "provider": "",
            "provider_msg_id": None,
            "attempted_at": now,
            "error": None,
        }
        await insert_notification_delivery(db, delivery_doc)
        event = DeliveryEvent(
            send_id=job.send_id,
            project_id=job.project_id,
            campaign_id=job.campaign_id,
            campaign_run_id=job.campaign_run_id,
            user_id=job.user_id,
            channel=job.channel,
            provider="",
            provider_msg_id=None,
            status="suppressed",
            attempted_at=now,
        )
        await _emit_delivery_event(producer, event)
        return

    # 2. Template + user (run concurrently)
    template_doc, user_doc = await asyncio.gather(
        _get_cached_template(db, job.project_id, job.template_id),
        get_user(db, job.project_id, job.user_id, job.brand_id),
    )

    if not template_doc:
        log.error("consumer.template_not_found", template_id=job.template_id)
        return

    if job.channel == "in_app":
        await _handle_in_app(job, template_doc, user_doc, db, producer, now)
        return

    # 3. Device tokens
    tokens = await get_user_device_tokens(db, job.project_id, job.user_id, brand_id=job.brand_id)
    if not tokens:
        log.warning("consumer.no_device_tokens")
        delivery_doc = {
            "send_id": job.send_id,
            "token_hash": "",
            "project_id": job.project_id,
            "campaign_id": job.campaign_id,
            "campaign_run_id": job.campaign_run_id,
            "user_id": job.user_id,
            "channel": job.channel,
            "status": "failed",
            "provider": "",
            "provider_msg_id": None,
            "attempted_at": now,
            "error": {"code": "no_device_tokens", "message": "No registered device tokens"},
        }
        await insert_notification_delivery(db, delivery_doc)
        return

    # 4. Render template once for all tokens
    try:
        rendered = render_push(template_doc, user_doc, job.context, None)
    except TemplateRenderError as exc:
        log.error("consumer.render_failed", error=str(exc))
        delivery_doc = {
            "send_id": job.send_id,
            "token_hash": "",
            "project_id": job.project_id,
            "campaign_id": job.campaign_id,
            "campaign_run_id": job.campaign_run_id,
            "user_id": job.user_id,
            "channel": job.channel,
            "status": "failed",
            "provider": "",
            "provider_msg_id": None,
            "attempted_at": now,
            "error": {"code": "template_error", "message": str(exc)},
        }
        await insert_notification_delivery(db, delivery_doc)
        return

    payload = RenderedPayload(
        title=rendered.title,
        body=rendered.body,
        image_url=rendered.image_url,
        extra={"campaign_id": job.campaign_id, "campaign_run_id": job.campaign_run_id},
    )

    # 5. Fan-out: one delivery per device token
    async def _deliver_to_token(token_doc: dict[str, Any]) -> None:
        token = token_doc["token"]
        platform = token_doc.get("platform", "android")
        token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]

        provider = await get_push_provider(platform, job.project_id, db, brand_id=job.brand_id)
        provider_name = getattr(provider, "name", "push_stub")
        breaker = get_breaker(provider_name)

        if not breaker.allow():
            log.warning("consumer.circuit_open", provider=provider_name)
            return

        recipient = Recipient(user_id=job.user_id, token=token, platform=platform, project_id=job.project_id, auto_dismiss_seconds=job.auto_dismiss_seconds)
        try:
            result = await provider.send(recipient, payload)
            breaker.record_success()
            status = "sent" if result.status == "accepted" else "failed"
            error = result.error
        except Exception as exc:
            breaker.record_failure()
            log.exception("consumer.provider_error", provider=provider_name)
            status = "failed"
            result_error: dict[str, str] = {"code": "provider_error", "message": str(exc)}
            delivery_doc = {
                "send_id": job.send_id,
                "token_hash": token_hash,
                "project_id": job.project_id,
                "campaign_id": job.campaign_id,
                "campaign_run_id": job.campaign_run_id,
                "user_id": job.user_id,
                "channel": job.channel,
                "status": status,
                "provider": provider_name,
                "provider_msg_id": None,
                "attempted_at": now,
                "error": result_error,
            }
            await insert_notification_delivery(db, delivery_doc)
            return

        delivery_doc = {
            "send_id": job.send_id,
            "token_hash": token_hash,
            "project_id": job.project_id,
            "campaign_id": job.campaign_id,
            "campaign_run_id": job.campaign_run_id,
            "user_id": job.user_id,
            "channel": job.channel,
            "status": status,
            "provider": provider_name,
            "provider_msg_id": result.provider_msg_id,
            "attempted_at": now,
            "error": error,
        }
        await insert_notification_delivery(db, delivery_doc)

        event = DeliveryEvent(
            send_id=job.send_id,
            project_id=job.project_id,
            campaign_id=job.campaign_id,
            campaign_run_id=job.campaign_run_id,
            user_id=job.user_id,
            channel=job.channel,
            provider=provider_name,
            provider_msg_id=result.provider_msg_id,
            status=status,
            attempted_at=now,
            error=error,
        )
        await _emit_delivery_event(producer, event)

    await asyncio.gather(*[_deliver_to_token(t) for t in tokens])


async def _handle_in_app(
    job: SendJob,
    template_doc: dict[str, Any],
    user_doc: dict[str, Any] | None,
    db: AsyncIOMotorDatabase,
    producer: AIOKafkaProducer,
    now: datetime,
) -> None:
    """in_app has no device tokens and no external provider — render once,
    write directly to the per-user inbox, and reuse the same delivery-log +
    Kafka delivery-event pattern as push for uniform reporting."""

    if not template_doc.get("variants"):
        log.error("consumer.in_app_no_variants", template_id=job.template_id)
        delivery_doc = {
            "send_id": job.send_id,
            "token_hash": "",
            "project_id": job.project_id,
            "campaign_id": job.campaign_id,
            "campaign_run_id": job.campaign_run_id,
            "user_id": job.user_id,
            "channel": job.channel,
            "status": "failed",
            "provider": "in_app",
            "provider_msg_id": None,
            "attempted_at": now,
            "error": {"code": "no_variants", "message": "Template has no variants"},
        }
        await insert_notification_delivery(db, delivery_doc)
        return

    try:
        rendered = render_in_app(
            template_doc, user_doc, job.context, job.campaign_id, job.user_id
        )
    except TemplateRenderError as exc:
        log.error("consumer.render_failed", error=str(exc))
        delivery_doc = {
            "send_id": job.send_id,
            "token_hash": "",
            "project_id": job.project_id,
            "campaign_id": job.campaign_id,
            "campaign_run_id": job.campaign_run_id,
            "user_id": job.user_id,
            "channel": job.channel,
            "status": "failed",
            "provider": "in_app",
            "provider_msg_id": None,
            "attempted_at": now,
            "error": {"code": "template_error", "message": str(exc)},
        }
        await insert_notification_delivery(db, delivery_doc)
        return

    notification_id = f"notif_{uuid.uuid4().hex}"
    expires_at = (
        now + timedelta(hours=job.expires_in_hours) if job.expires_in_hours else None
    )

    inbox_doc = {
        "notification_id": notification_id,
        "send_id": job.send_id,
        "project_id": job.project_id,
        "user_id": job.user_id,
        "campaign_id": job.campaign_id,
        "campaign_run_id": job.campaign_run_id,
        "template_id": job.template_id,
        "variant_id": rendered.variant_id,
        "template_type": rendered.template_type,
        "render_engine": rendered.render_engine,
        "trigger_type": job.trigger_type,
        "target_screens": job.target_screens,
        "title": rendered.title,
        "body": rendered.body,
        "media": rendered.media,
        "cta": rendered.cta,
        "close_button_visibility": rendered.close_button_visibility,
        "layout": rendered.layout,
        "web_view_url": rendered.web_view_url,
        "created_at": now,
        "expires_at": expires_at,
        "read": False,
        "read_at": None,
    }

    inserted_id = await insert_notification_inbox(db, inbox_doc)
    if not inserted_id:
        log.info("consumer.in_app_duplicate", send_id=job.send_id)
        return

    delivery_doc = {
        "send_id": job.send_id,
        "token_hash": "",
        "project_id": job.project_id,
        "campaign_id": job.campaign_id,
        "campaign_run_id": job.campaign_run_id,
        "user_id": job.user_id,
        "channel": job.channel,
        "status": "sent",
        "provider": "in_app",
        "provider_msg_id": notification_id,
        "attempted_at": now,
        "error": None,
    }
    await insert_notification_delivery(db, delivery_doc)

    event = DeliveryEvent(
        send_id=job.send_id,
        project_id=job.project_id,
        campaign_id=job.campaign_id,
        campaign_run_id=job.campaign_run_id,
        user_id=job.user_id,
        channel=job.channel,
        provider="in_app",
        provider_msg_id=notification_id,
        status="sent",
        attempted_at=now,
    )
    await _emit_delivery_event(producer, event)


# ---------------------------------------------------------------------------
# Batch callback + consumer loop
# ---------------------------------------------------------------------------


async def process_batch(
    records: list[ConsumerRecord],
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    jobs: list[SendJob] = []
    for record in records:
        try:
            jobs.append(SendJob.model_validate_json(record.value))
        except Exception:
            log.exception("consumer.parse_error", offset=record.offset, topic=record.topic)

    if not jobs:
        return

    semaphore = asyncio.Semaphore(20)

    async def _bounded(job: SendJob) -> None:
        async with semaphore:
            await handle_send_job(job, db, redis, producer)

    await asyncio.gather(*[_bounded(job) for job in jobs])
    log.info("consumer.batch_done", count=len(jobs))


async def consumer_loop(
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
    stop_event: asyncio.Event,
) -> None:
    async def _callback(records: list[ConsumerRecord]) -> None:
        await process_batch(records, db, redis, producer)

    consumer = KafkaConsumer(
        topics=[settings.kafka_send_topic],
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        callback=_callback,
        batch_size=settings.kafka_batch_size,
        batch_timeout_ms=settings.kafka_batch_timeout_ms,
    )

    async with consumer:
        run_task = asyncio.create_task(consumer.run())
        stop_task = asyncio.create_task(stop_event.wait())
        done, _ = await asyncio.wait(
            [run_task, stop_task], return_when=asyncio.FIRST_COMPLETED
        )
        await consumer.stop()
        run_task.cancel()
        stop_task.cancel()
        import contextlib
        with contextlib.suppress(asyncio.CancelledError):
            await run_task
        # Re-raise if consumer crashed so systemd restarts the service
        for task in done:
            if task is run_task and not task.cancelled():
                exc = task.exception()
                if exc:
                    raise exc
