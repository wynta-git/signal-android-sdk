"""
Pydantic models for bonus_eligibility.

bonus_eligibility columns:
  id, configure_id, site_id, eligibility_key, eligibility_value,
  eligibility_value_type, description, active,
  created_by, updated_by, created_at, updated_at, row_hash
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

EligibilityValueType = Literal["STRING", "INT", "DECIMAL", "BOOLEAN", "JSON"]


class BonusEligibilityCreate(BaseModel):
    """Request payload for creating one eligibility criterion row."""

    configure_id:           int                  = Field(..., ge=1)
    site_id:                int                  = Field(..., ge=1)
    eligibility_key:        str                  = Field(..., min_length=1, max_length=100)
    eligibility_value:      str                  = Field(..., min_length=1, max_length=500)
    eligibility_value_type: EligibilityValueType = "STRING"
    description:            str | None           = Field(None, max_length=500)
    active:                 bool                 = True
    created_by:             str                  = Field(..., min_length=1, max_length=100)


class BonusEligibilityResponse(BaseModel):
    """Response shape for a bonus_eligibility row."""

    id:                     int
    configure_id:           int
    site_id:                int
    eligibility_key:        str
    eligibility_value:      str
    eligibility_value_type: str
    description:            str | None
    active:                 bool
    created_by:             str
    updated_by:             str
    created_at:             datetime
    updated_at:             datetime

    model_config = {"from_attributes": True}


class BonusEligibilityUpdate(BaseModel):
    """PATCH payload — all fields optional; updated_by always required."""

    eligibility_key:        str | None           = Field(None, min_length=1, max_length=100)
    eligibility_value:      str | None           = Field(None, min_length=1, max_length=500)
    eligibility_value_type: EligibilityValueType | None = None
    description:            str | None           = Field(None, max_length=500)
    active:                 bool | None          = None
    updated_by:             str                  = Field(..., min_length=1, max_length=100)
