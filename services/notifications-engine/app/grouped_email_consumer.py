"""Kafka consumer for grouped email sends (pam.campaigns.send.grouped.email.v1).

Handles GroupedSendJob messages produced by scheduler-service's
run_campaign_grouped(). Each message already represents one homogeneous group
(a campaign only ever has one project_id/brand_id/template_id), so no
bucketing/regrouping is needed here — this consumer just resolves users,
renders once, and fires one (or a few, if the group exceeds SendGrid's
per-call ceiling) SendGrid batch call for the whole group.

Runs as a separate Kafka consumer/task from the push/in_app consumer in
app/consumer.py, with its own fetch-batch tuning, so push/in_app throughput
and latency are completely unaffected by email traffic.
"""

import asyncio
import hashlib
from datetime import UTC, datetime

import structlog
from aiokafka import AIOKafkaProducer, ConsumerRecord
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis
from shared.clients.kafka import KafkaConsumer
from shared.clients.mongo import admin_get_project, get_users_batch, insert_notification_delivery

from app.circuit_breaker import get_breaker
from app.config import settings
from app.consumer import _emit_delivery_event, _get_cached_template
from app.models import DeliveryEvent, GroupedSendJob
from app.providers.base import EmailRecipient
from app.providers.email import get_email_provider
from app.renderer import TemplateRenderError, build_email_substitutions, render_email_shared
from app.suppression import suppressed_user_ids
from app.unsubscribe import build_unsubscribe_url

log = structlog.get_logger()


def _token_hash(discriminator: str, user_id: str) -> str:
    """Distinguishes recipients that share one GroupedSendJob's send_id, so
    the (send_id, token_hash) uniqueness constraint on notification_deliveries
    never collides across different users in the same group — including
    users who share the same *failure reason* (e.g. two users both missing an
    email address in the same group)."""
    return hashlib.sha256(f"{discriminator}:{user_id}".encode()).hexdigest()[:16]


async def _write_delivery(
    db: AsyncIOMotorDatabase,
    producer: AIOKafkaProducer,
    job: GroupedSendJob,
    user_id: str,
    token_hash: str,
    status: str,
    provider_name: str,
    provider_msg_id: str | None,
    error: dict[str, str] | None,
    now: datetime,
) -> None:
    delivery_doc = {
        "send_id": job.send_id,
        "token_hash": token_hash,
        "project_id": job.project_id,
        "campaign_id": job.campaign_id,
        "campaign_run_id": job.campaign_run_id,
        "user_id": user_id,
        "channel": job.channel,
        "status": status,
        "provider": provider_name,
        "provider_msg_id": provider_msg_id,
        "attempted_at": now,
        "error": error,
    }
    await insert_notification_delivery(db, delivery_doc)
    event = DeliveryEvent(
        send_id=job.send_id,
        project_id=job.project_id,
        campaign_id=job.campaign_id,
        campaign_run_id=job.campaign_run_id,
        user_id=user_id,
        channel=job.channel,
        provider=provider_name,
        provider_msg_id=provider_msg_id,
        status=status,
        attempted_at=now,
        error=error,
    )
    await _emit_delivery_event(producer, event)


async def handle_grouped_email_job(
    job: GroupedSendJob,
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    structlog.contextvars.bind_contextvars(
        send_id=job.send_id,
        campaign_id=job.campaign_id,
        project_id=job.project_id,
        group_size=len(job.user_ids),
    )
    now = datetime.now(UTC)

    template_doc = await _get_cached_template(db, job.project_id, job.template_id)
    if not template_doc:
        log.error("grouped_email.template_not_found", template_id=job.template_id)
        return

    # Batch suppression check + batch user fetch — one Redis pipeline, one
    # Mongo $in query, regardless of group size.
    suppressed = await suppressed_user_ids(redis, job.project_id, job.user_ids, job.channel)
    users_by_id = await get_users_batch(db, job.project_id, job.user_ids)

    project_doc = await admin_get_project(db, job.project_id)
    try:
        rendered = render_email_shared(template_doc, project_doc)
    except TemplateRenderError as exc:
        log.error("grouped_email.render_failed", error=str(exc))
        for user_id in job.user_ids:
            await _write_delivery(
                db, producer, job, user_id, _token_hash("template_error", user_id),
                "failed", "", None, {"code": "template_error", "message": str(exc)}, now,
            )
        return

    recipients: list[EmailRecipient] = []
    recipient_user_ids: list[str] = []

    for user_id in job.user_ids:
        if user_id in suppressed:
            await _write_delivery(
                db, producer, job, user_id, _token_hash("suppressed", user_id),
                "suppressed", "", None, None, now,
            )
            continue

        user_doc = users_by_id.get(user_id)
        email = (user_doc or {}).get("traits", {}).get("email")
        if not email:
            await _write_delivery(
                db, producer, job, user_id, _token_hash("no_email", user_id),
                "failed", "", None,
                {"code": "no_email_address", "message": "User has no email address on file"}, now,
            )
            continue

        unsubscribe_url = build_unsubscribe_url(job.project_id, user_id)
        substitutions = build_email_substitutions(user_doc, job.context, unsubscribe_url)
        recipients.append(
            EmailRecipient(
                email=email,
                substitutions=substitutions,
                custom_args={"project_id": job.project_id, "user_id": user_id, "send_id": job.send_id},
            )
        )
        recipient_user_ids.append(user_id)

    if not recipients:
        return

    provider = await get_email_provider(job.project_id, db, brand_id=job.brand_id)
    provider_name = getattr(provider, "name", "sendgrid_stub")
    breaker = get_breaker(provider_name)

    chunk_size = settings.sendgrid_max_personalizations
    for start in range(0, len(recipients), chunk_size):
        chunk = recipients[start : start + chunk_size]
        chunk_user_ids = recipient_user_ids[start : start + chunk_size]

        if not breaker.allow():
            log.warning("grouped_email.circuit_open", provider=provider_name, chunk_size=len(chunk))
            continue

        try:
            result = await provider.send_batch(chunk, rendered.subject, rendered.html, rendered.text)
            breaker.record_success()
            status = "sent" if result.status == "accepted" else "failed"
            provider_msg_id = result.provider_msg_id
            error = result.error
        except Exception as exc:
            breaker.record_failure()
            log.exception("grouped_email.provider_error", provider=provider_name)
            status = "failed"
            provider_msg_id = None
            error = {"code": "provider_error", "message": str(exc)}

        for recipient, user_id in zip(chunk, chunk_user_ids):
            await _write_delivery(
                db,
                producer,
                job,
                user_id,
                _token_hash("email", user_id),
                status,
                provider_name,
                provider_msg_id,
                error,
                now,
            )


async def process_grouped_email_batch(
    records: list[ConsumerRecord],
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    jobs: list[GroupedSendJob] = []
    for record in records:
        try:
            jobs.append(GroupedSendJob.model_validate_json(record.value))
        except Exception:
            log.exception("grouped_email.parse_error", offset=record.offset, topic=record.topic)

    if not jobs:
        return

    await asyncio.gather(*[handle_grouped_email_job(job, db, redis, producer) for job in jobs])
    log.info("grouped_email.batch_done", count=len(jobs))


async def grouped_email_consumer_loop(
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
    stop_event: asyncio.Event,
) -> None:
    async def _callback(records: list[ConsumerRecord]) -> None:
        await process_grouped_email_batch(records, db, redis, producer)

    consumer = KafkaConsumer(
        topics=[settings.kafka_send_topic_grouped_email],
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.email_grouped_consumer_group,
        callback=_callback,
        batch_size=settings.email_grouped_kafka_batch_size,
        batch_timeout_ms=settings.email_grouped_kafka_batch_timeout_ms,
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
        for task in done:
            if task is run_task and not task.cancelled():
                exc = task.exception()
                if exc:
                    raise exc
