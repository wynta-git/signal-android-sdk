from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

_VALID_DOW = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}


class ScheduleInput(BaseModel):
    type: Literal["daily", "weekly", "monthly"]
    timezone: str = "UTC"
    start_date: date | None = None
    end_date: date | None = None
    schedule_time: str  # "HH:MM" 24h
    days_of_week: list[str] | None = None   # weekly only e.g. ["MON","WED","FRI"]
    days_of_month: list[int] | None = None  # monthly only e.g. [5, 15, 25], capped 1-28

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, KeyError):
            raise ValueError(f"Unknown timezone: {v}")
        return v

    @field_validator("schedule_time")
    @classmethod
    def validate_time(cls, v: str) -> str:
        parts = v.split(":")
        if len(parts) != 2 or not all(p.isdigit() for p in parts):
            raise ValueError("schedule_time must be HH:MM")
        if not (0 <= int(parts[0]) <= 23 and 0 <= int(parts[1]) <= 59):
            raise ValueError("schedule_time must be a valid 24h time")
        return v

    @field_validator("days_of_week")
    @classmethod
    def validate_days_of_week(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        upper = [d.upper() for d in v]
        invalid = [d for d in upper if d not in _VALID_DOW]
        if invalid:
            raise ValueError(f"Invalid days: {invalid}. Must be one of {_VALID_DOW}")
        return upper

    @field_validator("days_of_month")
    @classmethod
    def validate_days_of_month(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return v
        bad = [d for d in v if not 1 <= d <= 28]
        if bad:
            raise ValueError(f"days_of_month values must be 1–28, got {bad}")
        return v

    @model_validator(mode="after")
    def check_required_fields(self) -> ScheduleInput:
        if self.type == "weekly" and not self.days_of_week:
            raise ValueError("days_of_week is required for weekly schedule")
        if self.type == "monthly" and not self.days_of_month:
            raise ValueError("days_of_month is required for monthly schedule")
        return self


class Trigger(BaseModel):
    type: Literal["event", "scheduled", "one_off", "immediate"]
    event_name: str | None = None    # type=event
    schedule: ScheduleInput | None = None  # UI sends this; engine converts to cron
    cron: str | None = None          # computed by engine, never sent by UI
    send_at: datetime | None = None  # type=one_off


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
    # Scheduler fields — managed by scheduler-service, not campaign-engine
    picked: bool = False
    picked_at: datetime | None = None
    next_run_at: datetime | None = None  # cron campaigns: next scheduled fire time
    retry_count: int = 0


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
