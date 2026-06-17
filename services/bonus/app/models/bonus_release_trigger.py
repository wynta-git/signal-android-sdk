"""
Pydantic models for bonus_release_trigger.

bonus_release_trigger columns:
  id, configure_id, site_id, trigger_type, trigger_config,
  active, created_by, updated_by, created_at, updated_at
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

TriggerType = Literal[
    "LOGIN",
    "REGISTRATION",
    "APP_VISIT",
    "DEPOSIT",
    "BET_PLACED",
    "LEADERBOARD_WON",
    "TOURNAMENT_WON",
    "FRIEND_SIGNUP",
    "MANUAL",
    "REFERRAL",
    "PROMO_CODE",
    "MILESTONE",
]


class BonusReleaseTriggerCreate(BaseModel):
    """Request payload for creating a bonus_release_trigger row.

    Supply either ``configure_id`` (preferred) or ``code`` (legacy code-lookup path).
    ``configure_id`` takes priority when both are present.
    """

    configure_id:   int | None              = Field(None, ge=1)
    site_id:        int                     = Field(..., ge=1)
    code:           str | None              = Field(None, min_length=1, max_length=50)
    trigger_type:   TriggerType
    trigger_config: dict[str, Any] | None   = None
    active:         bool                    = True
    created_by:     str                     = ""

    @model_validator(mode="after")
    def require_configure_id_or_code(self) -> "BonusReleaseTriggerCreate":
        if self.configure_id is None and not self.code:
            raise ValueError("either configure_id or code must be provided")
        return self


class BonusReleaseTriggerResponse(BaseModel):
    """Response shape for a bonus_release_trigger row."""

    id:             int
    configure_id:   int
    site_id:        int
    trigger_type:   str
    trigger_config: dict[str, Any] | None
    active:         bool
    created_by:     str
    updated_by:     str
    created_at:     datetime
    updated_at:     datetime

    model_config = {"from_attributes": True}


class BonusReleaseTriggerUpdate(BaseModel):
    """PATCH payload — all fields optional; updated_by always required."""

    trigger_type:   TriggerType | None      = None
    trigger_config: dict[str, Any] | None   = None
    active:         bool | None             = None
    updated_by:     str                     = ""
