"""
Pydantic models for bonus_configure and its embedded code summary.

bonus_configure columns:
  id, subhead_id, site_id, name, description,
  start_date, end_date, applicability_frequency,   -- stored as DATETIME (UTC naive)
  wager_multiplier, no_of_chunks, release_bucket,
  chunk_expiry_days, bonus_expiry_days,
  wager_chip_type, credit_chip_type,
  bonus_amount_fixed, bonus_amount_percent, bonus_amount_max,
  priority, active, created_by, updated_by, created_at, updated_at
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

ApplicabilityFrequency = Literal["EVERYTIME", "ONCE", "MONTHLY", "WEEKLY"]


class BonusConfigureCreate(BaseModel):
    """Request payload for creating a new bonus_configure row."""

    subhead_id:                 int                    = Field(..., ge=1)
    site_id:                    int                    = Field(..., ge=1)
    name:                       str                    = Field(..., min_length=1, max_length=100)
    description:                str | None             = Field(None, max_length=500)
    start_date:                 datetime
    end_date:                   datetime
    applicability_frequency:    ApplicabilityFrequency = "EVERYTIME"
    wager_multiplier:           Decimal                = Field(Decimal("0.00"), ge=0)
    no_of_chunks:               int                    = Field(1, ge=1)
    release_bucket:             str | None             = Field(None, max_length=50)
    chunk_expiry_days:          int | None             = Field(None, ge=1)
    bonus_expiry_days:          int | None             = Field(None, ge=1)
    wager_chip_type:            str                    = Field("CASH", max_length=50)
    credit_chip_type:           str                    = Field("CASH", max_length=50)
    bonus_amount_fixed:         Decimal | None         = Field(None, ge=0)
    bonus_amount_percent:       Decimal | None         = Field(None, ge=0)
    bonus_amount_max:           Decimal | None         = Field(None, ge=0)
    priority:                   int                    = Field(0, ge=0)
    active:                     bool                   = True
    created_by:                 str                    = Field(..., min_length=1, max_length=100)

    @field_validator("start_date", "end_date", mode="after")
    @classmethod
    def _to_utc_naive(cls, v: datetime) -> datetime:
        """Convert timezone-aware datetimes to UTC naive for MySQL DATETIME storage."""
        if v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "BonusConfigureCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        if self.description is not None and self.description.strip() == "":
            raise ValueError("description must not be blank when provided")
        return self


class BonusConfigureResponse(BaseModel):
    """Response shape for a bonus_configure row."""

    id:                         int
    subhead_id:                 int
    site_id:                    int
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
    created_by:                 str
    updated_by:                 str
    created_at:                 datetime
    updated_at:                 datetime

    model_config = {"from_attributes": True}


class BonusCodeSummary(BaseModel):
    """Embedded code entry returned inside BonusConfigureDetail."""

    id:            int
    code:          str
    max_amount:    Decimal | None
    valid_from:    datetime | None
    valid_to:      datetime | None
    auto_apply:    bool
    display_order: int
    active:        bool


class BonusConfigureDetail(BonusConfigureResponse):
    """Full configure with its attached promo codes."""

    codes: list[BonusCodeSummary]


class BonusConfigureUpdate(BaseModel):
    """PATCH payload — all fields optional; updated_by always required."""

    name:                       str | None                      = Field(None, min_length=1, max_length=100)
    description:                str | None                      = None
    start_date:                 datetime | None                 = None
    end_date:                   datetime | None                 = None
    applicability_frequency:    ApplicabilityFrequency | None   = None
    wager_multiplier:           Decimal | None                  = Field(None, ge=0)
    no_of_chunks:               int | None                      = Field(None, ge=1)
    release_bucket:             str | None                      = None
    chunk_expiry_days:          int | None                      = Field(None, ge=1)
    bonus_expiry_days:          int | None                      = Field(None, ge=1)
    wager_chip_type:            str | None                      = Field(None, max_length=50)
    credit_chip_type:           str | None                      = Field(None, max_length=50)
    bonus_amount_fixed:         Decimal | None                  = Field(None, ge=0)
    bonus_amount_percent:       Decimal | None                  = Field(None, ge=0)
    bonus_amount_max:           Decimal | None                  = Field(None, ge=0)
    priority:                   int | None                      = Field(None, ge=0)
    active:                     bool | None                     = None
    updated_by:                 str                             = Field(..., min_length=1, max_length=100)

    @field_validator("start_date", "end_date", mode="after")
    @classmethod
    def _to_utc_naive(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v

    @model_validator(mode="after")
    def validate_update(self) -> "BonusConfigureUpdate":
        sd = self.start_date
        ed = self.end_date
        if sd is not None and ed is not None and ed < sd:
            raise ValueError("end_date must not be before start_date")
        if "description" in self.model_fields_set and self.description is not None:
            if self.description.strip() == "":
                raise ValueError("description must not be blank when provided")
        return self
