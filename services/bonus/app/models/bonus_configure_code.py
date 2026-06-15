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

    configure_id:        int           = Field(..., ge=1)
    site_id:             int           = Field(..., ge=1)
    code:                str           = Field(..., min_length=1, max_length=50)
    max_amount:          Decimal | None = None
    valid_from:          datetime | None = None
    valid_to:            datetime | None = None
    display_title:       str | None    = Field(None, max_length=200)
    display_description: str | None    = Field(None, max_length=500)
    terms_url:           str | None    = Field(None, max_length=500)
    banner_image_url:    str | None    = Field(None, max_length=500)
    badge_text:          str | None    = Field(None, max_length=100)
    cta_text:            str | None    = Field(None, max_length=100)
    auto_apply:          bool          = False
    display_order:       int           = Field(0, ge=0)
    display_on:          str           = Field("DEPOSIT", max_length=100)
    min_display_amount:  Decimal | None = None
    active:              bool          = True
    created_by:          str           = ""


class BonusConfigureCodeUpdate(BaseModel):
    """Partial-update payload for a bonus_configure_code row."""

    code:                str | None    = Field(None, min_length=1, max_length=50)
    max_amount:          Decimal | None = None
    valid_from:          datetime | None = None
    valid_to:            datetime | None = None
    display_title:       str | None    = Field(None, max_length=200)
    display_description: str | None    = Field(None, max_length=500)
    terms_url:           str | None    = Field(None, max_length=500)
    banner_image_url:    str | None    = Field(None, max_length=500)
    badge_text:          str | None    = Field(None, max_length=100)
    cta_text:            str | None    = Field(None, max_length=100)
    auto_apply:          bool | None   = None
    display_order:       int | None    = Field(None, ge=0)
    display_on:          str | None    = Field(None, max_length=100)
    min_display_amount:  Decimal | None = None
    active:              bool | None   = None
    updated_by:          str           = ""


class BonusConfigureCodeResponse(BaseModel):
    """Response shape for a bonus_configure_code row."""

    id:                  int
    configure_id:        int
    site_id:             int
    code:                str
    max_amount:          Decimal | None
    valid_from:          datetime | None
    valid_to:            datetime | None
    display_title:       str | None
    display_description: str | None
    terms_url:           str | None
    banner_image_url:    str | None
    badge_text:          str | None
    cta_text:            str | None
    auto_apply:          bool
    display_order:       int
    display_on:          str
    min_display_amount:  Decimal | None
    active:              bool
    created_by:          str
    updated_by:          str
    created_at:          datetime
    updated_at:          datetime

    model_config = {"from_attributes": True}
