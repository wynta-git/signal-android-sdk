from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class SdkInfo(BaseModel):
    name: str
    version: str


class DeviceInfo(BaseModel):
    platform: str | None = None
    os: str | None = None
    ua: str | None = None


# --- Per-event property models ---

class AppOpenedProperties(BaseModel):
    from_background: bool = False


class ScreenViewedProperties(BaseModel):
    screen_name: str
    referrer: str | None = None


class UserIdentifiedProperties(BaseModel):
    previous_id: str
    traits: dict[str, Any] = Field(default_factory=dict)


class PurchaseItem(BaseModel):
    sku: str
    qty: int
    price: float


class PurchaseCompletedProperties(BaseModel):
    order_id: str
    amount: float
    currency: str  # ISO 4217
    items: list[PurchaseItem] = Field(default_factory=list)


class DepositSuccessProperties(BaseModel):
    transaction_id: str
    amount: float
    currency: str  # ISO 4217
    payment_method: str | None = None


class InAppNotificationViewedProperties(BaseModel):
    notification_id: str
    campaign_id: str | None = None


class InAppNotificationClickedProperties(BaseModel):
    notification_id: str
    campaign_id: str | None = None
    cta_label: str | None = None


class InAppNotificationDismissedProperties(BaseModel):
    notification_id: str
    campaign_id: str | None = None


# Registry — add new events here and mirror in docs/event-schema.md (use /add-event)
REGISTERED_EVENTS: dict[str, type[BaseModel]] = {
    "app_opened": AppOpenedProperties,
    "screen_viewed": ScreenViewedProperties,
    "user_identified": UserIdentifiedProperties,
    "purchase_completed": PurchaseCompletedProperties,
    "deposit_success": DepositSuccessProperties,
    "in_app_notification_viewed": InAppNotificationViewedProperties,
    "in_app_notification_clicked": InAppNotificationClickedProperties,
    "in_app_notification_dismissed": InAppNotificationDismissedProperties,
}


class EventEnvelope(BaseModel):
    event_id: UUID
    event_name: str
    schema_version: int = 1
    project_id: str | None = None       # injected by api-service; clients must not send
    site_id: str | None = None           # injected by api-service; clients must not send
    client_id: str | None = None         # injected by api-service; clients must not send
    user_id: str
    session_id: str | None = None
    timestamp: datetime
    received_at: datetime | None = None  # set server-side by api-service
    sdk: SdkInfo | None = None
    device: DeviceInfo | None = None
    platform: str | None = None
    device_type: str | None = None
    brand_id: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
