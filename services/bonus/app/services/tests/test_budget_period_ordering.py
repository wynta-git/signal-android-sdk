"""Model-level validation: DAILY <= WEEKLY <= MONTHLY budget caps."""

import pytest
from pydantic import ValidationError

from app.models.bonus_head import BonusHeadCreate, LimitsUpsertRequest
from app.models.bonus_subhead import BonusSubheadCreate

_SUBHEAD_BASE = dict(head_id=1, site_id=1, name="tst", owner="vanessa", created_by="vanessa")
_HEAD_BASE = dict(site_id=1, name="tst", owner="vanessa", created_by="vanessa")


def _budget(daily: float | None, weekly: float | None, monthly: float | None) -> list[dict]:
    return [
        {"period_type": "DAILY", "budget_limit": daily},
        {"period_type": "WEEKLY", "budget_limit": weekly},
        {"period_type": "MONTHLY", "budget_limit": monthly},
    ]


def test_subhead_create_accepts_ordered_limits() -> None:
    BonusSubheadCreate(**_SUBHEAD_BASE, budget=_budget(100, 500, 2000))


def test_subhead_create_rejects_daily_above_weekly() -> None:
    with pytest.raises(ValidationError, match="DAILY limit .* cannot exceed WEEKLY"):
        BonusSubheadCreate(**_SUBHEAD_BASE, budget=_budget(600, 500, 2000))


def test_subhead_create_rejects_weekly_above_monthly() -> None:
    with pytest.raises(ValidationError, match="WEEKLY limit .* cannot exceed MONTHLY"):
        BonusSubheadCreate(**_SUBHEAD_BASE, budget=_budget(100, 3000, 2000))


def test_subhead_create_rejects_daily_above_monthly() -> None:
    with pytest.raises(ValidationError, match="DAILY limit .* cannot exceed MONTHLY"):
        BonusSubheadCreate(
            **_SUBHEAD_BASE,
            budget=[
                {"period_type": "DAILY", "budget_limit": 100},
                {"period_type": "MONTHLY", "budget_limit": 50},
            ],
        )


def test_subhead_create_null_limit_skips_ordering() -> None:
    BonusSubheadCreate(**_SUBHEAD_BASE, budget=_budget(None, 500, None))


def test_head_create_rejects_misordered_limits() -> None:
    with pytest.raises(ValidationError, match="cannot exceed"):
        BonusHeadCreate(**_HEAD_BASE, budget=_budget(600, 500, 2000))


def test_limits_upsert_rejects_misordered_limits() -> None:
    with pytest.raises(ValidationError, match="DAILY limit .* cannot exceed WEEKLY"):
        LimitsUpsertRequest(
            limits=[
                {"period_type": "DAILY", "budget_limit": 900},
                {"period_type": "WEEKLY", "budget_limit": 500},
            ],
            updated_by="vanessa",
        )


def test_limits_upsert_accepts_single_period() -> None:
    LimitsUpsertRequest(
        limits=[{"period_type": "WEEKLY", "budget_limit": 500}], updated_by="vanessa"
    )
