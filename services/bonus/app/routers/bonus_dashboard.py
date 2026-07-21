from fastapi import APIRouter, Query

from app.models.bonus_dashboard import (
    BonusDashboardActivityResponse,
    BonusDashboardAlertsResponse,
    BonusDashboardBudgetHealthResponse,
    BonusDashboardSummary,
    BonusDashboardTopBonusesResponse,
)
from app.services.bonus_dashboard_service import (
    get_budget_health,
    get_dashboard_alerts,
    get_dashboard_summary,
    get_recent_activity,
    get_top_bonuses,
    resolve_compare_window,
    resolve_window,
)

router = APIRouter(prefix="/bonus-dashboard", tags=["bonus-dashboard"])


@router.get("/summary", response_model=BonusDashboardSummary)
async def dashboard_summary(
    site_id: int,
    window_days: int = Query(default=7, ge=1, le=90),
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    compare_start: str | None = Query(default=None, description="YYYY-MM-DD"),
    compare_end: str | None = Query(default=None, description="YYYY-MM-DD"),
) -> BonusDashboardSummary:
    """Quick Stats + Total Active Promo Codes + Total Monthly Bonus + Bonus Lifecycle."""
    since, until, effective_days = resolve_window(start_date, end_date, window_days)
    prev_since = since - (until - since)
    comp_since, comp_until = resolve_compare_window(compare_start, compare_end, prev_since, since)
    return await get_dashboard_summary(site_id, since, until, comp_since, comp_until, effective_days)


@router.get("/top-bonuses", response_model=BonusDashboardTopBonusesResponse)
async def dashboard_top_bonuses(
    site_id: int,
    window_days: int = Query(default=7, ge=1, le=90),
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> BonusDashboardTopBonusesResponse:
    since, until, _ = resolve_window(start_date, end_date, window_days)
    return await get_top_bonuses(site_id, since, until, limit, offset)


@router.get("/recent-activity", response_model=BonusDashboardActivityResponse)
async def dashboard_recent_activity(
    site_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> BonusDashboardActivityResponse:
    return await get_recent_activity(site_id, limit, offset)


@router.get("/alerts", response_model=BonusDashboardAlertsResponse)
async def dashboard_alerts(site_id: int) -> BonusDashboardAlertsResponse:
    """Needs Attention: promo codes expiring within 7 days + budget-critical programs."""
    return await get_dashboard_alerts(site_id)


@router.get("/budget-health", response_model=BonusDashboardBudgetHealthResponse)
async def dashboard_budget_health(site_id: int) -> BonusDashboardBudgetHealthResponse:
    return await get_budget_health(site_id)
