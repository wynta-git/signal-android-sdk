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
    # Exactly one of template_id/inline_content is set. inline_content is
    # for flow-authored, self-contained content with no real campaign or
    # template behind it — rendered as if it were a template's `body` field
    # (see handle_send_job in consumer.py).
    template_id: str | None = None
    inline_content: dict[str, Any] | None = None
    trigger_type: str | None = None
    expires_in_hours: int | None = None
    context: dict[str, Any] = {}
    deliver_at: datetime
    auto_dismiss_seconds: int | None = None
    ignore_global_min_delay: bool = False


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
