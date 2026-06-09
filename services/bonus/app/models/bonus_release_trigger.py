"""
Pydantic models for bonus_release_trigger.

bonus_release_trigger columns:
  id, configure_id, site_id, trigger_type, trigger_config,
  active, created_by, updated_by, created_at, updated_at
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

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
    """Request payload for creating a bonus_release_trigger row."""

    site_id:        int                     = Field(..., ge=1)
    code:           str                     = Field(..., min_length=1, max_length=50)
    trigger_type:   TriggerType
    trigger_config: dict[str, Any] | None   = None
    active:         bool                    = True
    created_by:     str                     = Field(..., min_length=1, max_length=100)


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
    updated_by:     str                     = Field(..., min_length=1, max_length=100)
