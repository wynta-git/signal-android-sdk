from fastapi import APIRouter, Query

from app.models.bonus_reports import (
    BonusPerformanceResponse,
    BudgetSpendResponse,
    CustomReportResponse,
    PlayerActivityResponse,
)
from app.services.bonus_reports_service import (
    get_bonus_performance_report,
    get_budget_spend_report,
    get_custom_report,
    get_player_activity_report,
    resolve_window,
)

router = APIRouter(prefix="/reports", tags=["bonus-reports"])


@router.get("/bonus-performance", response_model=BonusPerformanceResponse)
async def bonus_performance_report(
    site_id: int,
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    window_days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> BonusPerformanceResponse:
    """Redemption and payout metrics across all bonus configurations."""
    since, until, effective_days = resolve_window(start_date, end_date, window_days)
    return await get_bonus_performance_report(
        site_id, since, until, since, until, effective_days, limit, offset,
    )


@router.get("/budget-spend", response_model=BudgetSpendResponse)
async def budget_spend_report(
    site_id: int,
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    window_days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> BudgetSpendResponse:
    """Budget utilisation, bonus cost by subhead and programme."""
    since, until, _ = resolve_window(start_date, end_date, 365)
    return await get_budget_spend_report(site_id, since, until, window_days, limit, offset)


@router.get("/player-activity", response_model=PlayerActivityResponse)
async def player_activity_report(
    site_id: int,
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> PlayerActivityResponse:
    """Bonus uptake and wagering progress per player."""
    since, until, _ = resolve_window(start_date, end_date, 365)
    return await get_player_activity_report(site_id, since, until, search, limit, offset)


@router.get("/custom", response_model=CustomReportResponse)
async def custom_report(
    site_id: int,
    dimension: str = Query(..., pattern=r"^(bonus|subhead|programme|player)$"),
    metrics: str = Query(..., description="Comma-separated metric keys"),
    status: str | None = Query(default=None, description="all | active | expired | paused"),
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> CustomReportResponse:
    """Ad-hoc report: one row per dimension value, one column per requested metric."""
    since, until, _ = resolve_window(start_date, end_date, 365)
    metric_list = [m.strip() for m in metrics.split(",") if m.strip()]
    effective_status = None if not status or status == "all" else status
    return await get_custom_report(site_id, dimension, metric_list, effective_status, since, until, limit, offset)
