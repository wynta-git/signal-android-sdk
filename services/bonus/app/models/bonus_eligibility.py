"""
Pydantic models for bonus_eligibility and bonus_eligibility_key.

bonus_eligibility columns:
  id, configure_id, site_id, description, active,
  created_by, updated_by, created_at, updated_at, row_hash

bonus_eligibility_key columns:
  id, eligibility_id, eligibility_key, eligibility_value,
  eligibility_value_type, created_at, updated_at
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

EligibilityValueType = Literal["STRING", "INT", "DECIMAL", "BOOLEAN", "JSON"]


# ---------------------------------------------------------------------------
# Eligibility Key models
# ---------------------------------------------------------------------------


class EligibilityKeyCreate(BaseModel):
    """One key-value criterion to add to an eligibility rule set."""

    eligibility_key:        str                  = Field(..., min_length=1, max_length=100)
    eligibility_value:      str                  = Field(..., min_length=1, max_length=500)
    eligibility_value_type: EligibilityValueType = "STRING"


class EligibilityKeyResponse(BaseModel):
    """Response shape for a single bonus_eligibility_key row."""

    id:                     int
    eligibility_id:         int
    eligibility_key:        str
    eligibility_value:      str
    eligibility_value_type: str
    created_at:             datetime
    updated_at:             datetime

    model_config = {"from_attributes": True}


class EligibilityKeyUpdate(BaseModel):
    """PATCH payload for a bonus_eligibility_key row."""

    eligibility_key:        str | None           = Field(None, min_length=1, max_length=100)
    eligibility_value:      str | None           = Field(None, min_length=1, max_length=500)
    eligibility_value_type: EligibilityValueType | None = None


# ---------------------------------------------------------------------------
# Eligibility (header) models
# ---------------------------------------------------------------------------


class BonusEligibilityCreate(BaseModel):
    """
    Request payload for creating a bonus_eligibility header row.

    ``keys`` is an optional list of eligibility_key criteria to create
    together with the header in a single request.
    """

    configure_id: int                     = Field(..., ge=1)
    site_id:      int                     = Field(..., ge=1)
    description:  str | None             = Field(None, max_length=500)
    active:       bool                   = True
    created_by:   str                    = Field(..., min_length=1, max_length=100)
    keys:         list[EligibilityKeyCreate] = Field(default_factory=list)


class BonusEligibilityResponse(BaseModel):
    """Response shape for a bonus_eligibility row with embedded keys."""

    id:           int
    configure_id: int
    site_id:      int
    description:  str | None
    active:       bool
    created_by:   str
    updated_by:   str
    created_at:   datetime
    updated_at:   datetime
    keys:         list[EligibilityKeyResponse] = []

    model_config = {"from_attributes": True}


class BonusEligibilityUpdate(BaseModel):
    """PATCH payload — only header fields; updated_by always required."""

    description: str | None = Field(None, max_length=500)
    active:      bool | None = None
    updated_by:  str         = Field(..., min_length=1, max_length=100)
