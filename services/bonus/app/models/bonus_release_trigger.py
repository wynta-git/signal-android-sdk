"""
Pydantic models for bonus_release_trigger.

bonus_release_trigger columns:
  id, configure_id, site_id, trigger_type, trigger_config,
  active, created_by, updated_by, created_at, updated_at
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

TriggerType = Literal[
    "LOGIN",
    "REGISTRATION",
    "APP_VISIT",
    "DEPOSIT_SUCCESS",
    "BET_PLACED",
    "LEADERBOARD_WON",
    "TOURNAMENT_WON",
    "FRIEND_SIGNUP",
    "MANUAL",
    "REFERRAL",
    "PROMO_CODE",
    "MILESTONE",
]

ReleaseType = Literal["BONUS_RELEASE", "CHUNK_RELEASE"]


class BonusReleaseTriggerCreate(BaseModel):
    """Request payload for creating a bonus_release_trigger row.

    Supply either ``configure_id`` (preferred) or ``code`` (legacy code-lookup path).
    ``configure_id`` takes priority when both are present.
    """

    configure_id:   int | None              = Field(None, ge=1)
    site_id:        int                     = Field(..., ge=1)
    code:           str | None              = Field(None, min_length=1, max_length=50)
    trigger_type:   TriggerType
    release_type:   ReleaseType             = "BONUS_RELEASE"
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
    release_type:   str
    trigger_config: dict[str, Any] | None
    active:         bool
    created_by:     str
    updated_by:     str
    created_at:     datetime
    updated_at:     datetime

    model_config = {"from_attributes": True}


class BonusConfigureSummary(BaseModel):
    """Bonus configure fields embedded inside TriggerWithConfigResponse."""

    id:                         int
    subhead_id:                 int
    head_id:                    int
    name:                       str
    description:                str | None
    start_date:                 datetime
    end_date:                   datetime
    applicability_frequency:    str
    wager_multiplier:           Decimal
    no_of_chunks:               int
    release_bucket:             str | None
    chunk_expiry_days:          int | None
    bonus_expiry_days:          int | None
    wager_chip_type:            str
    credit_chip_type:           str
    bonus_amount_fixed:         Decimal | None
    bonus_amount_percent:       Decimal | None
    bonus_amount_max:           Decimal | None
    priority:                   int
    active:                     bool


class TriggerWithConfigResponse(BaseModel):
    """Release trigger row with its parent bonus_configure embedded."""

    id:                  int
    configure_id:        int
    site_id:             int
    trigger_type:        str
    release_type:        str
    min_trigger_amount:  Decimal | None
    max_trigger_amount:  Decimal | None
    payment_method:      str | None
    product:             str | None
    occurrence:          int
    trigger_config:      dict[str, Any] | None
    active:              bool
    configure:           BonusConfigureSummary


class BonusReleaseTriggerUpdate(BaseModel):
    """PATCH payload — all fields optional; updated_by always required."""

    trigger_type:   TriggerType | None      = None
    release_type:   ReleaseType | None      = None
    trigger_config: dict[str, Any] | None   = None
    active:         bool | None             = None
    updated_by:     str                     = ""
