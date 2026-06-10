"""
Pydantic models for bonus_head, derived from:
  db-scripts/config-table/bonus_head.sql

  id          INT AUTO_INCREMENT PK
  site_id     INT NOT NULL
  name        VARCHAR(100) NOT NULL   UNIQUE per site
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
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z0-9_.\- ]+$")

_OwnerStr = Annotated[str, Field(min_length=1, max_length=100)]
_ActorStr = Annotated[str, Field(min_length=1, max_length=100)]


def _clean(value: str) -> str:
    return value.strip()


def _validate_identifier(field: str, value: str) -> str:
    if not _IDENTIFIER_RE.match(value):
        raise ValueError(
            f"{field} may only contain letters, digits, spaces, hyphens, underscores, and dots"
        )
    return value


PeriodType = Literal["DAILY", "WEEKLY", "MONTHLY"]


class LimitUpsertItem(BaseModel):
    period_type: PeriodType
    budget_limit: Decimal | None = Field(None, ge=0)


def _no_duplicate_periods(limits: list[LimitUpsertItem]) -> None:
    seen: set[str] = set()
    for entry in limits:
        if entry.period_type in seen:
            raise ValueError(f"duplicate period_type in request: {entry.period_type}")
        seen.add(entry.period_type)


class BonusHeadCreate(BaseModel):
    """Request payload for creating a new bonus_head row."""

    site_id: int = Field(..., ge=1, description="Site this bonus head belongs to")
    name: str = Field(..., min_length=1, max_length=100, description="Unique name within the site")
    description: str | None = Field(None, max_length=500)
    active: bool = Field(True, description="Whether this head is active")
    owner: _OwnerStr = Field(..., description="Primary accountable person (username or email)")
    created_by: _ActorStr = Field(..., description="Actor creating this record")
    budget: list[LimitUpsertItem] = Field(
        ..., min_length=1, description="Budget caps per period; budget_limit null = uncapped"
    )

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return _clean(v)

    @field_validator("owner", mode="before")
    @classmethod
    def clean_owner(cls, v: str) -> str:
        return _clean(v)

    @field_validator("created_by", mode="before")
    @classmethod
    def clean_created_by(cls, v: str) -> str:
        return _clean(v)

    @field_validator("name")
    @classmethod
    def validate_name_chars(cls, v: str) -> str:
        return _validate_identifier("name", v)

    @field_validator("owner")
    @classmethod
    def validate_owner_chars(cls, v: str) -> str:
        return _validate_identifier("owner", v)

    @field_validator("created_by")
    @classmethod
    def validate_created_by_chars(cls, v: str) -> str:
        return _validate_identifier("created_by", v)

    @model_validator(mode="after")
    def description_not_blank(self) -> "BonusHeadCreate":
        if self.description is not None and self.description.strip() == "":
            raise ValueError("description must not be blank when provided")
        return self

    @model_validator(mode="after")
    def no_duplicate_periods(self) -> "BonusHeadCreate":
        _no_duplicate_periods(self.budget)
        return self


class BonusHeadResponse(BaseModel):
    """Response shape returned after a successful create."""

    id: int
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


class OwnerEntry(BaseModel):
    username: str
    role: str
    active: bool


class SubheadSummary(BaseModel):
    id: int
    name: str
    description: str | None
    active: bool
    owner: str


class BudgetPeriod(BaseModel):
    period_type: str
    limit: Decimal | None
    used: Decimal
    reset_at: datetime | None


class BonusHeadDetail(BonusHeadResponse):
    """Full bonus head with owners, subheads, and budget (limits + current usage)."""

    owners: list[OwnerEntry]
    subheads: list[SubheadSummary]
    budget: list[BudgetPeriod]


# ---------------------------------------------------------------------------
# Update models
# ---------------------------------------------------------------------------

OwnerRole = Literal["OPS_LEAD", "CAMPAIGN_MANAGER", "FINANCE_APPROVER", "ESCALATION_CONTACT"]


class BonusHeadUpdate(BaseModel):
    """PATCH payload — all head fields optional; updated_by always required."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    active: bool | None = None
    owner: str | None = Field(None, min_length=1, max_length=100)
    updated_by: str = Field(..., min_length=1, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        return _clean(v) if v is not None else v

    @field_validator("owner", mode="before")
    @classmethod
    def clean_owner(cls, v: str | None) -> str | None:
        return _clean(v) if v is not None else v

    @field_validator("updated_by", mode="before")
    @classmethod
    def clean_updated_by(cls, v: str) -> str:
        return _clean(v)

    @field_validator("name")
    @classmethod
    def validate_name_chars(cls, v: str | None) -> str | None:
        return _validate_identifier("name", v) if v is not None else v

    @field_validator("owner")
    @classmethod
    def validate_owner_chars(cls, v: str | None) -> str | None:
        return _validate_identifier("owner", v) if v is not None else v

    @model_validator(mode="after")
    def description_not_blank(self) -> "BonusHeadUpdate":
        if "description" in self.model_fields_set and self.description is not None:
            if self.description.strip() == "":
                raise ValueError("description must not be blank when provided")
        return self


class OwnerUpsertItem(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    role: OwnerRole
    active: bool = True


class OwnersUpsertRequest(BaseModel):
    """PUT /bonus-heads/{id}/owners — upsert one or more owner assignments."""

    owners: list[OwnerUpsertItem] = Field(..., min_length=1)
    updated_by: str = Field(..., min_length=1, max_length=100)

    @model_validator(mode="after")
    def no_duplicate_usernames(self) -> "OwnersUpsertRequest":
        seen: set[str] = set()
        for entry in self.owners:
            if entry.username in seen:
                raise ValueError(f"duplicate username in request: {entry.username}")
            seen.add(entry.username)
        return self


class LimitsUpsertRequest(BaseModel):
    """PUT /bonus-heads/{id}/limits — upsert budget caps for one or more periods."""

    limits: list[LimitUpsertItem] = Field(..., min_length=1)
    updated_by: str = Field(..., min_length=1, max_length=100)

    @model_validator(mode="after")
    def no_duplicate_periods(self) -> "LimitsUpsertRequest":
        _no_duplicate_periods(self.limits)
        return self
