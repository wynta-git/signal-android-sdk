"""Tests for bonus_dashboard_service — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.bonus_dashboard_service import (
    get_budget_health,
    get_dashboard_alerts,
    get_dashboard_summary,
    get_recent_activity,
    get_top_bonuses,
    resolve_compare_window,
    resolve_window,
)

_NOW = datetime(2026, 7, 16, tzinfo=timezone.utc)


@pytest.fixture
def cur() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def patch_conn(cur: AsyncMock):
    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cur)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor_ctx
    conn.commit = AsyncMock()

    @asynccontextmanager
    async def _fake_get_connection(pool=None):
        yield conn

    with patch("app.services.bonus_dashboard_service.get_connection", _fake_get_connection):
        yield conn


# ---------------------------------------------------------------------------
# resolve_window / resolve_compare_window
# ---------------------------------------------------------------------------


def test_resolve_window_uses_explicit_dates() -> None:
    since, until, days = resolve_window("2026-07-10", "2026-07-16", 7)
    assert since == datetime(2026, 7, 10, tzinfo=timezone.utc)
    assert until == datetime(2026, 7, 17, tzinfo=timezone.utc)
    assert days == 7


def test_resolve_window_falls_back_to_rolling_window() -> None:
    since, until, days = resolve_window(None, None, 30)
    assert days == 30
    assert (until - since) == timedelta(days=30)


def test_resolve_compare_window_uses_explicit_dates() -> None:
    since = datetime(2026, 7, 10, tzinfo=timezone.utc)
    until = datetime(2026, 7, 17, tzinfo=timezone.utc)
    cs, ce = resolve_compare_window("2026-07-03", "2026-07-09", since, until)
    assert cs == datetime(2026, 7, 3, tzinfo=timezone.utc)
    assert ce == datetime(2026, 7, 10, tzinfo=timezone.utc)


def test_resolve_compare_window_falls_back() -> None:
    since = datetime(2026, 7, 10, tzinfo=timezone.utc)
    until = datetime(2026, 7, 17, tzinfo=timezone.utc)
    cs, ce = resolve_compare_window(None, None, since, until)
    assert (cs, ce) == (since, until)


# ---------------------------------------------------------------------------
# get_dashboard_summary — percentages relative to Credited (monthly_granted)
# ---------------------------------------------------------------------------

_SUMMARY_ROW = (
    2, 7, 16, 2, 9, 12,                       # heads, subheads, configures, paused, codes, codes_created
    Decimal("5450000.00"), Decimal("9700000.00"),  # granted, limit
    Decimal("3160000.00"), Decimal("2650000.00"),  # released, consumed
    Decimal("1200000.00"), Decimal("490100.00"), Decimal("599000.00"),  # pending, forfeit, expiring
    5061, 4200,                                # redemptions, redemptions_prev
    Decimal("7700.00"),                        # avg_payout
    38420, 36870,                              # active_players, active_players_prev
)


async def test_get_dashboard_summary_percentages_relative_to_credited(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.return_value = _SUMMARY_ROW
    cur.fetchall.return_value = [(date(2026, 7, 15), 3), (date(2026, 7, 16), 4)]

    since = _NOW - timedelta(days=7)
    result = await get_dashboard_summary(217, since, _NOW, since - timedelta(days=7), since, 7)

    assert result.active_promo_codes == 9
    assert result.active_configures == 16
    assert result.active_configures_paused == 2
    assert result.redemptions == 5061
    assert result.redemptions_change_pct == pytest.approx(round((5061 - 4200) / 4200 * 100, 1))
    assert result.active_players == 38420
    assert result.monthly_granted == Decimal("5450000.00")

    # All lifecycle percentages are relative to Credited (monthly_granted), not released.
    assert result.released_pct == pytest.approx(58.0, abs=0.1)
    assert result.pending_pct == pytest.approx(22.0, abs=0.1)
    assert result.consumed_pct == pytest.approx(48.6, abs=0.1)
    assert result.expiry_pct == pytest.approx(11.0, abs=0.1)
    assert result.forfeit_pct == pytest.approx(9.0, abs=0.1)
    assert len(result.promo_codes_trend) == 2
    assert result.promo_codes_trend[0].count == 3


async def test_get_dashboard_summary_zero_prev_period_yields_no_change_pct(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    row = list(_SUMMARY_ROW)
    row[14] = 0  # redemptions_prev
    row[17] = 0  # active_players_prev
    cur.fetchone.return_value = tuple(row)
    cur.fetchall.return_value = []

    result = await get_dashboard_summary(217, _NOW, _NOW, _NOW, _NOW, 7)

    assert result.redemptions_change_pct is None
    assert result.active_players_change_pct is None


async def test_get_dashboard_summary_zero_budget_limit_is_zero_pct(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    row = list(_SUMMARY_ROW)
    row[7] = Decimal("0.00")  # monthly_limit
    cur.fetchone.return_value = tuple(row)
    cur.fetchall.return_value = []

    result = await get_dashboard_summary(217, _NOW, _NOW, _NOW, _NOW, 7)

    assert result.monthly_pct == 0.0


# ---------------------------------------------------------------------------
# get_top_bonuses
# ---------------------------------------------------------------------------


async def test_get_top_bonuses_orders_and_paginates(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = (16,)
    cur.fetchall.side_effect = [
        [
            (11, "VIP Welcome — Curated", "Whale Welcome", "Whale Welcome", 1, 404, 358, Decimal("62100.00")),
            (12, "Manual Bonus Campaigns", "Manual Bonus", "Manual Bonus", 1, 378, 327, Decimal("13800.00")),
        ],
        [(11, date(2026, 7, 15), 200), (11, date(2026, 7, 16), 204), (12, date(2026, 7, 16), 378)],
    ]

    result = await get_top_bonuses(217, _NOW - timedelta(days=7), _NOW, limit=10, offset=0)

    assert result.total == 16
    assert result.limit == 10
    assert len(result.bonuses) == 2
    assert result.bonuses[0].name == "VIP Welcome — Curated"
    assert result.bonuses[0].status == "Active"
    assert result.bonuses[0].redemptions == 404
    assert len(result.bonuses[0].trend) == 2
    assert result.bonuses[1].trend[0].count == 378


async def test_get_top_bonuses_paused_configure_status(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = (1,)
    cur.fetchall.side_effect = [
        [(5, "Old Promo", "Legacy", "Legacy", 0, 0, 0, Decimal("0.00"))],
        [],
    ]

    result = await get_top_bonuses(217, _NOW, _NOW, limit=10, offset=0)

    assert result.bonuses[0].status == "Paused"


async def test_get_top_bonuses_no_rows_skips_trend_query(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = (0,)
    cur.fetchall.return_value = []

    result = await get_top_bonuses(217, _NOW, _NOW, limit=10, offset=0)

    assert result.bonuses == []
    # only the count query ran fetchall-relevant execute for the list (no trend IN(...) query)
    assert cur.execute.call_count == 2


# ---------------------------------------------------------------------------
# get_recent_activity
# ---------------------------------------------------------------------------


async def test_get_recent_activity_parses_union_rows(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = (42,)
    cur.fetchall.return_value = [
        ("CREDITED", "P1007", 11, "VIP Welcome", Decimal("480.00"), _NOW),
        ("EXPIRED", "P1005", 12, "FD Bonus — Legacy", Decimal("50.00"), _NOW - timedelta(minutes=19)),
    ]

    result = await get_recent_activity(217, limit=20, offset=0)

    assert result.total == 42
    assert len(result.activities) == 2
    assert result.activities[0].event_type == "CREDITED"
    assert result.activities[0].pam_user_id == "P1007"
    assert result.activities[1].event_type == "EXPIRED"


# ---------------------------------------------------------------------------
# get_dashboard_alerts
# ---------------------------------------------------------------------------


async def test_get_dashboard_alerts_expiring_code_and_budget_critical(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    valid_to = datetime.now() + timedelta(days=3)
    cur.fetchall.side_effect = [
        [(20, "SLOTS_LB", "Weekly Slots Leaderboard", valid_to, "Weekly Slots Leaderboard")],
        [(7, "High Roller VIP", Decimal("2002000.00"), Decimal("2200000.00"))],
    ]

    result = await get_dashboard_alerts(217)

    assert len(result.alerts) == 2
    assert result.alerts[0].severity == "warning"
    assert result.alerts[0].entity_type == "BONUS_CONFIGURE_CODE"
    assert result.alerts[1].severity == "critical"
    assert "High Roller VIP" in result.alerts[1].title
    assert "91%" in result.alerts[1].subtitle


async def test_get_dashboard_alerts_empty_when_nothing_flagged(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchall.side_effect = [[], []]

    result = await get_dashboard_alerts(217)

    assert result.alerts == []


# ---------------------------------------------------------------------------
# get_budget_health
# ---------------------------------------------------------------------------


async def test_get_budget_health_computes_pct_and_uses_owner(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchall.return_value = [
        (1, "Welcome Bonus program", "vanessa@wynta.com",
         Decimal("1740000.00"), Decimal("3500000.00"),
         Decimal("124800.00"), Decimal("175000.00")),
        (3, "High Roller VIP", "priya@wynta.com",
         Decimal("2002000.00"), Decimal("2200000.00"),
         Decimal("44000.00"), Decimal("110000.00")),
    ]

    result = await get_budget_health(217)

    assert len(result.programs) == 2
    welcome = result.programs[0]
    assert welcome.owner == "vanessa@wynta.com"
    assert welcome.monthly_pct == pytest.approx(49.7, abs=0.1)
    assert welcome.daily_pct == pytest.approx(71.3, abs=0.1)

    vip = result.programs[1]
    assert vip.monthly_pct == pytest.approx(91.0, abs=0.1)


async def test_get_budget_health_null_limit_yields_none_pct(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchall.return_value = [
        (1, "Uncapped Program", None, Decimal("500.00"), None, Decimal("10.00"), None),
    ]

    result = await get_budget_health(217)

    assert result.programs[0].monthly_limit is None
    assert result.programs[0].monthly_pct is None
