from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field
import uuid


class ExecutionEvent(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    campaign_id: str
    project_id: str
    trigger_type: Literal["one_off", "scheduled"]
    fired_at: datetime
    attempt: int = 1
