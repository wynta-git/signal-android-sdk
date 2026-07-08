"""
Pydantic models for bonus_configure and its embedded code summary.

bonus_configure columns:
  id, subhead_id, site_id, name, description,
  start_date, end_date, applicability_frequency,   -- stored as DATETIME (UTC naive)
  wager_multiplier, no_of_chunks, release_bucket,
  chunk_expiry_days, bonus_expiry_days,
  wager_chip_type, credit_chip_type,
  bonus_amount_fixed, bonus_amount_percent, bonus_amount_max,
  cashback_bonus_amount_fixed, cashback_bonus_amount_percent, cashback_bonus_amount_max,
  priority, active, created_by, updated_by, created_at, updated_at
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.bonus_head import BudgetPeriod

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
    wager_multiplier:           Decimal | None         = Field(None, ge=0)
    no_of_chunks:               int | None             = Field(None, ge=1)
    release_bucket:             str | None             = Field(None, max_length=50)
    chunk_expiry_days:          int | None             = Field(None, ge=1)
    bonus_expiry_days:          int | None             = Field(None, ge=1)
    wager_chip_type:            str | None             = Field(None, max_length=50)
    credit_chip_type:           str                    = Field("CASH", max_length=50)
    bonus_amount_fixed:              Decimal | None         = Field(None, ge=0)
    bonus_amount_percent:            Decimal | None         = Field(None, ge=0)
    bonus_amount_max:                Decimal | None         = Field(None, ge=0)
    cashback_bonus_amount_fixed:     Decimal | None         = Field(None, ge=0)
    cashback_bonus_amount_percent:   Decimal | None         = Field(None, ge=0)
    cashback_bonus_amount_max:       Decimal | None         = Field(None, ge=0)
    priority:                        int                    = Field(0, ge=0)
    active:                          bool                   = True
    created_by:                      str                    = ""

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


class TriggerSummary(BaseModel):
    """Trigger row embedded in a configure response."""

    id:             int
    trigger_type:   str
    release_type:   str                   = "BONUS_RELEASE"
    trigger_config: dict[str, Any] | None = None
    active:         bool


class EligibilitySummary(BaseModel):
    """Eligibility criterion row embedded in a configure response."""

    id:                     int
    eligibility_key:        str
    eligibility_value:      str
    eligibility_value_type: str
    active:                 bool


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
    no_of_chunks:               int | None
    release_bucket:             str | None
    chunk_expiry_days:          int | None
    bonus_expiry_days:          int | None
    wager_chip_type:            str
    credit_chip_type:           str
    bonus_amount_fixed:              Decimal | None
    bonus_amount_percent:            Decimal | None
    bonus_amount_max:                Decimal | None
    cashback_bonus_amount_fixed:     Decimal | None
    cashback_bonus_amount_percent:   Decimal | None
    cashback_bonus_amount_max:       Decimal | None
    priority:                        int
    active:                          bool
    created_by:                      str
    updated_by:                      str
    created_at:                      datetime
    updated_at:                      datetime
    budget:                          list[BudgetPeriod]       = []
    triggers:                        list[TriggerSummary]     = []
    eligibilities:                   list[EligibilitySummary] = []

    model_config = {"from_attributes": True}


class BonusCodeSummary(BaseModel):
    """Embedded code entry returned inside BonusConfigureDetail."""

    id:                int
    code:              str
    max_amount:        Decimal | None
    valid_from:        datetime | None
    valid_to:          datetime | None
    auto_apply:        bool
    system_auto_apply: bool | None
    display_order:     int
    active:            bool
    is_manual_bonus:   bool = False

    # Populated from the linked bonus_manual_bonus_file row when is_manual_bonus — None otherwise.
    manual_bonus_status:          str | None = None
    manual_bonus_total_players:   int | None = None
    manual_bonus_total_amount:    Decimal | None = None
    manual_bonus_success_players: int | None = None
    manual_bonus_success_amount:  Decimal | None = None
    manual_bonus_failed_players:  int | None = None
    manual_bonus_failed_amount:   Decimal | None = None


class BonusConfigureDetail(BonusConfigureResponse):
    """Full configure with its attached promo codes."""

    codes: list[BonusCodeSummary] = []


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
    bonus_amount_fixed:              Decimal | None                  = Field(None, ge=0)
    bonus_amount_percent:            Decimal | None                  = Field(None, ge=0)
    bonus_amount_max:                Decimal | None                  = Field(None, ge=0)
    cashback_bonus_amount_fixed:     Decimal | None                  = Field(None, ge=0)
    cashback_bonus_amount_percent:   Decimal | None                  = Field(None, ge=0)
    cashback_bonus_amount_max:       Decimal | None                  = Field(None, ge=0)
    priority:                        int | None                      = Field(None, ge=0)
    active:                          bool | None                     = None
    updated_by:                      str                             = ""

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
