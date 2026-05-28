from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SendJob(BaseModel):
    send_id: str
    project_id: str
    campaign_id: str
    campaign_run_id: str
    user_id: str
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
