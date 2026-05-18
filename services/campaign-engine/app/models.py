from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


class Trigger(BaseModel):
    type: Literal["event", "scheduled", "one_off"]
    event_name: str | None = None   # type=event
    cron: str | None = None         # type=scheduled
    send_at: datetime | None = None # type=one_off


class Audience(BaseModel):
    segment_id: str | None = None
    all: bool = False


class Delay(BaseModel):
    minutes: int = 0


class RateLimit(BaseModel):
    per_user_per_day: int = 1
    per_user_per_campaign_total: int | None = None


class Campaign(BaseModel):
    campaign_id: str
    project_id: str
    name: str
    status: Literal["draft", "scheduled", "running", "paused", "completed", "cancelled"]
    trigger: Trigger
    audience: Audience
    channel: Literal["push", "email", "sms", "webhook"]
    template_id: str
    rate_limit: RateLimit = Field(default_factory=RateLimit)
    delay: Delay | None = None
    created_at: datetime
    updated_at: datetime


class CampaignRun(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    campaign_id: str
    status: Literal["running", "completed", "failed"] = "running"
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None
    sent_count: int = 0
    skipped_count: int = 0
    failed_count: int = 0


class SendJob(BaseModel):
    send_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    campaign_id: str
    campaign_run_id: str
    user_id: str
    channel: Literal["push", "email", "sms", "webhook"]
    template_id: str
    context: dict[str, Any] = Field(default_factory=dict)
    deliver_at: datetime


class NotificationTemplate(BaseModel):
    template_id: str
    project_id: str
    name: str
    channel: Literal["push", "email", "sms", "webhook"]
    body: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# API request / response shapes
# ---------------------------------------------------------------------------


class CreateCampaignRequest(BaseModel):
    name: str
    trigger: Trigger
    audience: Audience
    channel: Literal["push", "email", "sms", "webhook"]
    template_id: str
    rate_limit: RateLimit = Field(default_factory=RateLimit)
    delay: Delay | None = None


class UpdateCampaignRequest(BaseModel):
    name: str | None = None
    audience: Audience | None = None
    template_id: str | None = None
    rate_limit: RateLimit | None = None
    delay: Delay | None = None


class CreateTemplateRequest(BaseModel):
    name: str
    channel: Literal["push", "email", "sms", "webhook"]
    body: dict[str, Any]


class UpdateTemplateRequest(BaseModel):
    name: str | None = None
    body: dict[str, Any] | None = None
