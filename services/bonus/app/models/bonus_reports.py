from decimal import Decimal

from pydantic import BaseModel


class TrackedValue(BaseModel):
    """A metric that may not be instrumented yet — value is None when untracked.

    Mirrors campaign-engine's `_UNTRACKED = {"value": None, "tracked": False}`
    sentinel (services/campaign-engine/app/routes/dashboard.py), typed.
    """
    value: Decimal | float | int | None = None
    tracked: bool = True


# ---------------------------------------------------------------------------
# Bonus Performance
# ---------------------------------------------------------------------------


class BonusPerformanceRow(BaseModel):
    configure_id: int
    name: str
    programme: str
    type: str
    redemptions: int
    players: int
    avg_payout: Decimal
    redeem_rate: TrackedValue
    status: str


class BonusPerformanceResponse(BaseModel):
    window_days: int
    redemptions: int
    unique_players: int
    avg_payout: Decimal
    ggr_vs_cost: TrackedValue
    total: int
    limit: int
    offset: int
    rows: list[BonusPerformanceRow]


# ---------------------------------------------------------------------------
# Budget & Spend
# ---------------------------------------------------------------------------


class BudgetSpendRow(BaseModel):
    subhead_id: int
    name: str
    description: str | None
    programme: str
    bonuses: int
    budget_limit: Decimal | None
    used: Decimal
    utilisation_pct: float | None
    bonus_cost: Decimal
    ggr: TrackedValue
    avg_cost_per_redeem: Decimal


class BudgetSpendResponse(BaseModel):
    window_days: int
    total_bonus_cost: Decimal
    avg_cost_per_redemption: Decimal
    budget_utilisation_pct: float
    total: int
    limit: int
    offset: int
    rows: list[BudgetSpendRow]


# ---------------------------------------------------------------------------
# Player Activity
# ---------------------------------------------------------------------------


class PlayerActivityRow(BaseModel):
    pam_user_id: str
    external_user_id: str
    bonuses_received: int
    redeemed_count: int
    total_value: Decimal
    wagering_completion_pct: float


class PlayerActivityResponse(BaseModel):
    total_players: int
    total_bonus_value: Decimal
    avg_wagering_pct: float
    total: int
    limit: int
    offset: int
    rows: list[PlayerActivityRow]


# ---------------------------------------------------------------------------
# Custom Report
# ---------------------------------------------------------------------------


class CustomReportRow(BaseModel):
    dimension_label: str
    values: dict[str, TrackedValue]


class CustomReportResponse(BaseModel):
    dimension: str
    columns: list[str]
    total: int
    limit: int
    offset: int
    rows: list[CustomReportRow]
