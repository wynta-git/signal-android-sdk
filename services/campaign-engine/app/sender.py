import json
from datetime import datetime
from typing import Any

import structlog
from aiokafka import AIOKafkaProducer

from app.config import settings
from app.models import Campaign, SendJob

log = structlog.get_logger()


async def emit_send_job(
    producer: AIOKafkaProducer,
    *,
    campaign: Campaign,
    campaign_run_id: str,
    user_id: str,
    deliver_at: datetime,
    context: dict[str, Any] | None = None,
) -> None:
    job = SendJob(
        project_id=campaign.project_id,
        campaign_id=campaign.campaign_id,
        campaign_run_id=campaign_run_id,
        user_id=user_id,
        brand_id=campaign.brand_id,
        channel=campaign.channel,
        template_id=campaign.template_id,
        trigger_type=campaign.trigger_type,
        target_screens=campaign.target_screens,
        expires_in_hours=campaign.expires_in_hours,
        context=context or {},
        deliver_at=deliver_at,
        auto_dismiss_seconds=campaign.auto_dismiss_seconds,
        ignore_global_min_delay=campaign.ignore_global_min_delay,
    )
    key = user_id.encode()
    value = json.dumps(job.model_dump(mode="json")).encode()
    await producer.send(settings.kafka_send_topic, key=key, value=value)
    log.debug(
        "send_job.emitted",
        project_id=campaign.project_id,
        campaign_id=campaign.campaign_id,
        user_id=user_id,
        deliver_at=deliver_at.isoformat(),
    )
