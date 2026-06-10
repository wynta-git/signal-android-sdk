"""
Pydantic models for bonus_configure_code.

bonus_configure_code columns:
  id, configure_id, site_id, code, max_amount,
  valid_from, valid_to, display_title, display_description,
  terms_url, banner_image_url, badge_text, cta_text,
  auto_apply, display_order, display_on, min_display_amount,
  active, created_by, updated_by, created_at, updated_at
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class BonusConfigureCodeCreate(BaseModel):
    """Request payload for creating a bonus_configure_code row."""

    configure_id:  int   = Field(..., ge=1)
    site_id:       int   = Field(..., ge=1)
    code:          str   = Field(..., min_length=1, max_length=50)
    display_on:    str   = Field("DEPOSIT", max_length=100)
    auto_apply:    bool  = False
    active:        bool  = True
    created_by:    str   = Field(..., min_length=1, max_length=100)


class BonusConfigureCodeResponse(BaseModel):
    """Response shape for a bonus_configure_code row."""

    id:            int
    configure_id:  int
    site_id:       int
    code:          str
    max_amount:    Decimal | None
    valid_from:    datetime | None
    valid_to:      datetime | None
    auto_apply:    bool
    display_order: int
    display_on:    str
    active:        bool
    created_by:    str
    updated_by:    str
    created_at:    datetime
    updated_at:    datetime

    model_config = {"from_attributes": True}
