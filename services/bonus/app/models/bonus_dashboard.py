from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class TrendPoint(BaseModel):
    date: date
    count: int


class BonusDashboardSummary(BaseModel):
    window_days: int

    # ── Quick Stats ────────────────────────────────────────────────────────────
    active_promo_codes: int
    promo_codes_created_this_period: int
    active_configures: int
    active_configures_paused: int
    active_heads: int
    active_subheads: int
    redemptions: int
    redemptions_change_pct: float | None
    avg_payout: Decimal
    active_players: int
    active_players_change_pct: float | None

    # ── Monthly Bonus (Credited/Released/Pending/Expired/Forfeited) ──────────
    monthly_granted: Decimal
    monthly_limit: Decimal
    monthly_pct: float
    monthly_released: Decimal
    monthly_consumed: Decimal
    monthly_pending: Decimal
    monthly_forfeit: Decimal
    monthly_expiring: Decimal

    # Percentages below are all relative to monthly_granted ("Credited").
    released_pct: float
    pending_pct: float
    consumed_pct: float
    expiry_pct: float
    forfeit_pct: float

    promo_codes_trend: list[TrendPoint]


class TopBonusItem(BaseModel):
    configure_id: int
    name: str
    subtitle: str | None
    type: str
    trend: list[TrendPoint]
    redemptions: int
    players: int
    avg_payout: Decimal
    status: str


class BonusDashboardTopBonusesResponse(BaseModel):
    total: int
    limit: int
    offset: int
    bonuses: list[TopBonusItem]


class ActivityItem(BaseModel):
    event_type: str
    pam_user_id: str
    configure_id: int
    configure_name: str
    amount: Decimal
    occurred_at: str


class BonusDashboardActivityResponse(BaseModel):
    total: int
    limit: int
    offset: int
    activities: list[ActivityItem]


class AlertItem(BaseModel):
    severity: str
    title: str
    subtitle: str
    entity_type: str
    entity_id: int


class BonusDashboardAlertsResponse(BaseModel):
    alerts: list[AlertItem]


class BudgetHealthProgram(BaseModel):
    entity_type: str
    entity_id: int
    name: str
    owner: str | None
    monthly_used: Decimal
    monthly_limit: Decimal | None
    monthly_pct: float | None
    daily_used: Decimal
    daily_limit: Decimal | None
    daily_pct: float | None


class BonusDashboardBudgetHealthResponse(BaseModel):
    programs: list[BudgetHealthProgram]
