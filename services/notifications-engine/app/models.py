from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SendJob(BaseModel):
    send_id: str
    project_id: str
    campaign_id: str
    campaign_run_id: str
    user_id: str
    brand_id: str | None = None
    channel: str
    template_id: str
    trigger_type: str | None = None
    target_screens: list[str] | None = None
    target_events: list[str] | None = None
    expires_in_hours: int | None = None
    context: dict[str, Any] = {}
    deliver_at: datetime
    auto_dismiss_seconds: int | None = None
    ignore_global_min_delay: bool = False


class GroupedSendJob(BaseModel):
    """Emitted by scheduler-service's run_campaign_grouped() for channels
    whose provider batches many recipients into one API call (email now;
    sms/whatsapp/telegram later). Same campaign/template/context shape as
    SendJob, but user_ids instead of a single user_id — no profile data, no
    personalization fields; those are resolved here in notifications-engine."""

    send_id: str
    project_id: str
    campaign_id: str
    campaign_run_id: str
    user_ids: list[str]
    brand_id: str | None = None
    channel: str
    template_id: str
    context: dict[str, Any] = {}
    deliver_at: datetime


class DeliveryEvent(BaseModel):
    send_id: str
    project_id: str
    campaign_id: str
    campaign_run_id: str
    user_id: str
    channel: str
    provider: str
    provider_msg_id: str | None
    status: str  # sent | failed | suppressed
    attempted_at: datetime
    error: dict[str, str] | None = None
