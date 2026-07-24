"""
Pydantic models for bonus_subhead, derived from:
  db-scripts/config-table/bonus_subhead.sql

  id          INT AUTO_INCREMENT PK
  head_id     INT NOT NULL  → bonus_head.id
  site_id     INT NOT NULL
  name        VARCHAR(100) NOT NULL   UNIQUE per head
  description VARCHAR(500) NULL
  active      TINYINT(1)  NOT NULL DEFAULT 1
  owner       VARCHAR(100) NOT NULL
  created_by  VARCHAR(100) NOT NULL
  updated_by  VARCHAR(100) NOT NULL
  created_at  DATETIME auto
  updated_at  DATETIME auto
"""

import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.bonus_head import (
    BudgetPeriod,
    LimitsUpsertRequest,
    LimitUpsertItem,
    OwnerEntry,
    OwnersUpsertRequest,
    _no_duplicate_periods,
    _validate_period_ordering,
)

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z0-9_.\- ]+$")


def _clean(value: str) -> str:
    return value.strip()


def _validate_identifier(field: str, value: str) -> str:
    if not _IDENTIFIER_RE.match(value):
        raise ValueError(
            f"{field} may only contain letters, digits, spaces, hyphens, underscores, and dots"
        )
    return value


class BonusSubheadCreate(BaseModel):
    """Request payload for creating a new bonus_subhead row."""

    head_id: int = Field(..., ge=1, description="Parent bonus_head id")
    site_id: int = Field(..., ge=1, description="Site this subhead belongs to")
    name: str = Field(..., min_length=3, max_length=100, description="Unique name within the head")
    description: str | None = Field(None, max_length=500)
    active: bool = Field(True)
    owner: str = Field(..., min_length=1, max_length=100)
    created_by: str = Field(default="", exclude=True)
    budget: list[LimitUpsertItem] = Field(
        ..., min_length=1, description="Budget caps per period; budget_limit null = uncapped"
    )

    @model_validator(mode="before")
    @classmethod
    def strip_server_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data.pop("created_by", None)
        return data

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return _clean(v)

    @field_validator("owner", mode="before")
    @classmethod
    def clean_owner(cls, v: str) -> str:
        return _clean(v)

    @field_validator("name")
    @classmethod
    def validate_name_chars(cls, v: str) -> str:
        return _validate_identifier("name", v)

    @field_validator("owner")
    @classmethod
    def validate_owner_chars(cls, v: str) -> str:
        return _validate_identifier("owner", v)

    @model_validator(mode="after")
    def description_not_blank(self) -> "BonusSubheadCreate":
        if self.description is not None and self.description.strip() == "":
            raise ValueError("description must not be blank when provided")
        return self

    @model_validator(mode="after")
    def no_duplicate_periods(self) -> "BonusSubheadCreate":
        _no_duplicate_periods(self.budget)
        _validate_period_ordering(self.budget)
        return self


class BonusSubheadResponse(BaseModel):
    """Response shape returned after a successful create or update."""

    id: int
    head_id: int
    site_id: int
    name: str
    description: str | None
    active: bool
    owner: str
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BonusSubheadUpdate(BaseModel):
    """PATCH payload — all subhead fields optional; updated_by always required."""

    name: str | None = Field(None, min_length=3, max_length=100)
    description: str | None = None
    active: bool | None = None
    owner: str | None = Field(None, min_length=1, max_length=100)
    updated_by: str = ""

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        return _clean(v) if v is not None else v

    @field_validator("owner", mode="before")
    @classmethod
    def clean_owner(cls, v: str | None) -> str | None:
        return _clean(v) if v is not None else v

    @field_validator("name")
    @classmethod
    def validate_name_chars(cls, v: str | None) -> str | None:
        return _validate_identifier("name", v) if v is not None else v

    @field_validator("owner")
    @classmethod
    def validate_owner_chars(cls, v: str | None) -> str | None:
        return _validate_identifier("owner", v) if v is not None else v

    @model_validator(mode="after")
    def description_not_blank(self) -> "BonusSubheadUpdate":
        if "description" in self.model_fields_set and self.description is not None:
            if self.description.strip() == "":
                raise ValueError("description must not be blank when provided")
        return self


class BonusSubheadDetail(BonusSubheadResponse):
    """Full bonus subhead with owners and budget (limits + current usage)."""

    owners: list[OwnerEntry]
    budget: list[BudgetPeriod]


__all__ = [
    "BonusSubheadCreate",
    "BonusSubheadResponse",
    "BonusSubheadUpdate",
    "BonusSubheadDetail",
    "OwnersUpsertRequest",
    "LimitsUpsertRequest",
    "OwnerEntry",
    "BudgetPeriod",
]
