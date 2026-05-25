"""
Pydantic models for bonus_release_trigger.

bonus_release_trigger columns:
  id, configure_id, site_id, trigger_type, description,
  min_trigger_amount, max_trigger_amount, payment_method, product,
  occurrence, active, created_by, updated_by, created_at, updated_at
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal

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
]


class BonusReleaseTriggerCreate(BaseModel):
    """
    Request payload for creating a bonus_release_trigger row.

    ``code`` is used to resolve the parent bonus_configure. Pass the promo code
    (e.g. ``FIRST_DEPOSIT``) and the API looks up ``configure_id`` automatically
    via the ``bonus_configure_code`` table.
    """

    site_id:             int             = Field(..., ge=1)
    code:                str             = Field(..., min_length=1, max_length=50)
    trigger_type:        TriggerType
    description:         str | None      = Field(None, max_length=500)
    min_trigger_amount:  Decimal | None  = Field(None, ge=0)
    max_trigger_amount:  Decimal | None  = Field(None, ge=0)
    payment_method:      str | None      = Field(None, max_length=50)
    product:             str | None      = Field(None, max_length=50)
    occurrence:          int             = Field(0, ge=0)
    active:              bool            = True
    created_by:          str             = Field(..., min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_amounts(self) -> "BonusReleaseTriggerCreate":
        mn = self.min_trigger_amount
        mx = self.max_trigger_amount
        if mn is not None and mx is not None and mx < mn:
            raise ValueError("max_trigger_amount must not be less than min_trigger_amount")
        if self.description is not None and self.description.strip() == "":
            raise ValueError("description must not be blank when provided")
        return self


class BonusReleaseTriggerResponse(BaseModel):
    """Response shape for a bonus_release_trigger row."""

    id:                  int
    configure_id:        int
    site_id:             int
    trigger_type:        str
    description:         str | None
    min_trigger_amount:  Decimal | None
    max_trigger_amount:  Decimal | None
    payment_method:      str | None
    product:             str | None
    occurrence:          int
    active:              bool
    created_by:          str
    updated_by:          str
    created_at:          datetime
    updated_at:          datetime

    model_config = {"from_attributes": True}


class BonusReleaseTriggerUpdate(BaseModel):
    """PATCH payload — all fields optional; updated_by always required."""

    trigger_type:        TriggerType | None  = None
    description:         str | None          = None
    min_trigger_amount:  Decimal | None      = Field(None, ge=0)
    max_trigger_amount:  Decimal | None      = Field(None, ge=0)
    payment_method:      str | None          = None
    product:             str | None          = None
    occurrence:          int | None          = Field(None, ge=0)
    active:              bool | None         = None
    updated_by:          str                 = Field(..., min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_amounts(self) -> "BonusReleaseTriggerUpdate":
        mn = self.min_trigger_amount
        mx = self.max_trigger_amount
        if mn is not None and mx is not None and mx < mn:
            raise ValueError("max_trigger_amount must not be less than min_trigger_amount")
        if "description" in self.model_fields_set and self.description is not None:
            if self.description.strip() == "":
                raise ValueError("description must not be blank when provided")
        return self
