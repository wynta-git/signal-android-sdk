from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

_VALID_DOW = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}


class ScheduleInput(BaseModel):
    type: Literal["immediate", "once", "daily", "weekly", "monthly"]
    timezone: str = "UTC"
    start_date: date | None = None
    end_date: date | None = None
    schedule_time: str | None = None  # "HH:MM" 24h — not required for "immediate"
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
    def validate_time(cls, v: str | None) -> str | None:
        if v is None:
            return v
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
        if self.type == "immediate":
            return self
        if self.type in ("once", "daily", "weekly", "monthly") and not self.schedule_time:
            raise ValueError(f"schedule_time is required for {self.type} schedule")
        if self.type == "once" and not self.start_date:
            raise ValueError("start_date is required for once schedule")
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
    target_platforms: list[str] = []


class Delay(BaseModel):
    minutes: int = 0


class RateLimit(BaseModel):
    per_user_per_day: int = 1
    per_user_per_campaign_total: int | None = None


class Campaign(BaseModel):
    campaign_id: str
    project_id: str
    brand_id: str | None = None
    name: str
    tags: str | None = None
    objective: str | None = None
    status: Literal["draft", "scheduled", "running", "paused", "completed", "cancelled"]
    trigger: Trigger
    audience: Audience
    channel: Literal["push", "email", "sms", "webhook"]
    template_id: str
    rate_limit: RateLimit = Field(default_factory=RateLimit)
    delay: Delay | None = None
    min_delay_between_sends_minutes: int | None = None
    ignore_global_min_delay: bool = False
    auto_dismiss_seconds: int | None = None
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
    brand_id: str | None = None
    channel: Literal["push", "email", "sms", "webhook"]
    template_id: str
    context: dict[str, Any] = Field(default_factory=dict)
    deliver_at: datetime
    auto_dismiss_seconds: int | None = None
    ignore_global_min_delay: bool = False


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


class InlineMessage(BaseModel):
    title: str
    body: str
    deep_link: str | None = None


class ChannelConfig(BaseModel):
    type: Literal["push", "email", "sms", "webhook"]
    template_id: str | None = None
    message: InlineMessage | None = None

    @model_validator(mode="after")
    def check_template_or_message(self) -> ChannelConfig:
        if not self.template_id and not self.message:
            raise ValueError("Provide either template_id or message")
        return self


class AutoDismiss(BaseModel):
    dismiss_after_seconds: int


class DeliveryConfig(BaseModel):
    rate_limit: RateLimit = Field(default_factory=RateLimit)
    delay: Delay | None = None
    min_delay_between_sends_minutes: int | None = None
    ignore_global_min_delay: bool = False
    auto_dismiss: AutoDismiss | None = None


class TriggerInput(BaseModel):
    type: Literal["event", "scheduled"]
    event_name: str | None = None
    schedule: ScheduleInput | None = None

    @model_validator(mode="after")
    def check_required_fields(self) -> TriggerInput:
        if self.type == "event" and not self.event_name:
            raise ValueError("event_name is required for event trigger")
        if self.type == "scheduled" and not self.schedule:
            raise ValueError("schedule is required for scheduled trigger")
        return self


class CreateCampaignRequest(BaseModel):
    name: str
    brand_id: str | None = None
    tags: str | None = None
    objective: str | None = None
    trigger: TriggerInput
    audience: Audience
    channel: ChannelConfig
    delivery: DeliveryConfig = Field(default_factory=DeliveryConfig)


class UpdateCampaignRequest(BaseModel):
    name: str | None = None
    tags: str | None = None
    objective: str | None = None
    audience: Audience | None = None
    channel: ChannelConfig | None = None
    delivery: DeliveryConfig | None = None


class CreateTemplateRequest(BaseModel):
    name: str
    channel: Literal["push", "email", "sms", "webhook"]
    body: dict[str, Any]


class UpdateTemplateRequest(BaseModel):
    name: str | None = None
    body: dict[str, Any] | None = None


class FcmSettingsRequest(BaseModel):
    server_key: str = ""
    sender_id: str = ""
    service_account_json: dict[str, Any]

    @field_validator("service_account_json")
    @classmethod
    def validate_sa_json(cls, v: dict[str, Any]) -> dict[str, Any]:
        required = {"type", "project_id", "private_key_id", "private_key", "client_email"}
        missing = required - v.keys()
        if missing:
            raise ValueError(f"service_account_json missing required fields: {sorted(missing)}")
        if v.get("type") != "service_account":
            raise ValueError("service_account_json.type must be 'service_account'")
        return v


# ---------------------------------------------------------------------------
# Custom reports
# ---------------------------------------------------------------------------

_VALID_METRICS: frozenset[str] = frozenset({
    "messages_sent",
    "open_rate",
    "ctr",
    "conversions",
    "conversion_rate",
    "revenue_influenced",
    "delivery_rate",
    "bounce_rate",
    "opt_out_rate",
    "segment_size",
    "segment_growth",
    "player_health_score",
    "churn_rate",
    "win_back_rate",
    "avg_deposits",
    "active_users",
})

_VALID_DATE_RANGES: frozenset[str] = frozenset({"last_7_days", "last_30_days", "last_90_days"})


class ReportFilters(BaseModel):
    date_range: str = "last_7_days"
    channel: str = "all"
    segment_id: str | None = None

    @field_validator("date_range")
    @classmethod
    def validate_date_range(cls, v: str) -> str:
        if v not in _VALID_DATE_RANGES:
            raise ValueError(f"date_range must be one of {sorted(_VALID_DATE_RANGES)}")
        return v


class CreateReportRequest(BaseModel):
    name: str
    metrics: list[str]
    filters: ReportFilters = Field(default_factory=ReportFilters)

    @field_validator("metrics")
    @classmethod
    def validate_metrics(cls, v: list[str]) -> list[str]:
        invalid = [m for m in v if m not in _VALID_METRICS]
        if invalid:
            raise ValueError(f"Unknown metrics: {invalid}")
        if not v:
            raise ValueError("metrics must not be empty")
        return v


class UpdateReportRequest(BaseModel):
    name: str | None = None
    metrics: list[str] | None = None
    filters: ReportFilters | None = None

    @field_validator("metrics")
    @classmethod
    def validate_metrics(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        invalid = [m for m in v if m not in _VALID_METRICS]
        if invalid:
            raise ValueError(f"Unknown metrics: {invalid}")
        if not v:
            raise ValueError("metrics must not be empty")
        return v


class CustomReport(BaseModel):
    report_id: str
    user_id: str
    project_id: str
    name: str
    metrics: list[str]
    filters: ReportFilters
    created_at: datetime
    updated_at: datetime
