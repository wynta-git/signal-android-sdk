"""Tests for bonus_reports_service — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.bonus_reports_service import (
    get_bonus_performance_report,
    get_budget_spend_report,
    get_custom_report,
    get_player_activity_report,
)

_NOW = datetime(2026, 7, 16, tzinfo=timezone.utc)
# bonus_configure.end_date as returned by aiomysql is a naive datetime (no
# tzinfo) — status derivation compares it against datetime.now(), also naive.
_FUTURE_END_DATE = datetime.now() + timedelta(days=30)
_PAST_END_DATE = datetime.now() - timedelta(days=1)


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

    with patch("app.services.bonus_reports_service.get_connection", _fake_get_connection):
        yield conn


# ---------------------------------------------------------------------------
# get_bonus_performance_report
# ---------------------------------------------------------------------------


async def test_bonus_performance_report_ggr_and_redeem_rate_untracked(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.side_effect = [
        (5061, 4046, Decimal("9200.00")),  # KPI row
        (16,),                              # total configure count
    ]
    cur.fetchall.return_value = [
        (11, "VIP Welcome — Curated", "Retention", "Whale Welcome", 1, _FUTURE_END_DATE, 304, 243, Decimal("3400.00")),
        (12, "Old Promo", "Acquisition", "Legacy", 0, _PAST_END_DATE, 0, 0, Decimal("0.00")),
    ]

    result = await get_bonus_performance_report(
        217, _NOW - timedelta(days=180), _NOW, _NOW - timedelta(days=7), _NOW, 7, limit=50, offset=0,
    )

    assert result.redemptions == 5061
    assert result.unique_players == 4046
    assert result.ggr_vs_cost.tracked is False
    assert result.ggr_vs_cost.value is None
    assert result.total == 16

    assert result.rows[0].redeem_rate.tracked is False
    assert result.rows[0].programme == "Retention"
    assert result.rows[0].status == "Active"
    # end_date in the past -> Expired takes priority over active=0/Paused
    assert result.rows[1].status == "Expired"


async def test_bonus_performance_report_paused_status(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [(0, 0, Decimal("0.00")), (1,)]
    cur.fetchall.return_value = [
        (5, "Paused Promo", "Retention", "Reload", 0, _FUTURE_END_DATE, 0, 0, Decimal("0.00")),
    ]

    result = await get_bonus_performance_report(217, _NOW, _NOW, _NOW, _NOW, 7, limit=50, offset=0)

    assert result.rows[0].status == "Paused"


# ---------------------------------------------------------------------------
# get_budget_spend_report
# ---------------------------------------------------------------------------


async def test_budget_spend_report_computes_utilisation_and_avg_cost(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.side_effect = [
        (5061, Decimal("37040000.00")),           # KPI: redemption_count, total_cost
        (Decimal("12100000.00"), Decimal("24380000.00")),  # budget used, limit
        (10,),                                     # total subhead count
    ]
    cur.fetchall.return_value = [
        (1, "First Deposit Match", "100% match ...", "—", 4,
         Decimal("5000000.00"), Decimal("2420000.00"), Decimal("1910000.00"), 700),
    ]

    result = await get_budget_spend_report(217, _NOW - timedelta(days=180), _NOW, 7, limit=50, offset=0)

    assert result.total_bonus_cost == Decimal("37040000.00")
    # avg_cost_per_redemption must be rounded to exactly 2 decimal places,
    # not the raw long-decimal division result.
    assert result.avg_cost_per_redemption == Decimal("7318.71")
    assert result.budget_utilisation_pct == pytest.approx(49.63, abs=0.01)

    row = result.rows[0]
    assert row.utilisation_pct == pytest.approx(48.4, abs=0.01)
    assert row.avg_cost_per_redeem == Decimal("2728.57")
    assert row.ggr.tracked is False


async def test_budget_spend_report_null_budget_limit_yields_none_utilisation(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.side_effect = [(0, Decimal("0.00")), (Decimal("0.00"), Decimal("0.00")), (1,)]
    cur.fetchall.return_value = [
        (1, "Uncapped", None, "—", 1, None, Decimal("0.00"), Decimal("0.00"), 0),
    ]

    result = await get_budget_spend_report(217, _NOW, _NOW, 7, limit=50, offset=0)

    assert result.budget_utilisation_pct == 0.0
    assert result.rows[0].utilisation_pct is None
    assert result.rows[0].avg_cost_per_redeem == Decimal("0")


# ---------------------------------------------------------------------------
# get_player_activity_report
# ---------------------------------------------------------------------------


async def test_player_activity_report_computes_wagering_pct(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = (15, Decimal("244000.00"), Decimal("117120.00"))  # KPI
    cur.fetchall.side_effect = [
        [  # bonus_grant rows (POOL_BONUS) — no external id here, resolved separately
            ("70", 4, 4, Decimal("31100.00"), Decimal("23014.00")),
            ("23", 1, 0, Decimal("2900.00"), Decimal("0.00")),
        ],
        [(70, "james_k"), (23, "zoe_p")],  # external id batch lookup (POOL_COMMON)
    ]

    result = await get_player_activity_report(217, _NOW - timedelta(days=180), _NOW, None, limit=50, offset=0)

    assert result.total_players == 15
    assert result.avg_wagering_pct == pytest.approx(48.0, abs=0.1)
    assert result.rows[0].wagering_completion_pct == pytest.approx(74.0, abs=0.1)
    assert result.rows[0].external_user_id == "james_k"
    assert result.rows[1].wagering_completion_pct == 0.0
    assert result.rows[1].external_user_id == "zoe_p"


async def test_player_activity_report_search_filters_by_matching_pam_ids(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.return_value = (1, Decimal("300.00"), Decimal("100.00"))  # KPI (unfiltered by search)
    cur.fetchall.side_effect = [
        [(70,)],  # search lookup (POOL_COMMON) — only pam_user_id 70 matches "james"
        [  # bonus_grant rows (POOL_BONUS) — 99 is NOT in the search match set
            ("70", 1, 0, Decimal("100.00"), Decimal("50.00")),
            ("99", 2, 1, Decimal("200.00"), Decimal("50.00")),
        ],
        [(70, "james_k")],  # external id lookup for the surviving row
    ]

    result = await get_player_activity_report(217, _NOW, _NOW, "james", limit=50, offset=0)

    search_call = cur.execute.call_args_list[0]
    assert "LIKE" in search_call.args[0]
    assert search_call.args[1][-1] == "%james%"

    assert result.total == 1
    assert result.rows[0].pam_user_id == "70"
    assert result.rows[0].external_user_id == "james_k"


async def test_player_activity_report_search_no_matches_short_circuits(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchall.side_effect = [[]]  # search lookup finds nobody

    result = await get_player_activity_report(217, _NOW, _NOW, "nobody", limit=50, offset=0)

    assert result.total == 0
    assert result.rows == []
    cur.fetchone.assert_not_awaited()


async def test_player_activity_report_missing_external_user_id_falls_back_to_pam_id(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.return_value = (1, Decimal("100.00"), Decimal("0.00"))
    cur.fetchall.side_effect = [
        [("99", 1, 0, Decimal("100.00"), Decimal("0.00"))],
        [],  # external id lookup finds no mapping row
    ]

    result = await get_player_activity_report(217, _NOW, _NOW, None, limit=50, offset=0)

    assert result.rows[0].external_user_id == "99"


# ---------------------------------------------------------------------------
# get_custom_report
# ---------------------------------------------------------------------------


async def test_custom_report_bonus_dimension_tracked_and_untracked_metrics(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.return_value = (14,)
    cur.fetchall.return_value = [
        (11, "VIP Welcome", 10, 8, Decimal("100.00"), Decimal("1000.00"), Decimal("2000.00"),
         Decimal("500.00"), Decimal("5000.00")),
    ]

    result = await get_custom_report(
        217, "bonus",
        ["redemptions", "avg_payout", "budget_utilisation_pct", "ggr"],
        None, _NOW - timedelta(days=180), _NOW, limit=50, offset=0,
    )

    assert result.dimension == "bonus"
    assert result.total == 14
    row = result.rows[0]
    assert row.dimension_label == "VIP Welcome"
    assert row.values["redemptions"].value == 10
    assert row.values["avg_payout"].value == Decimal("100.00")
    assert row.values["budget_utilisation_pct"].value == pytest.approx(10.0, abs=0.1)
    assert row.values["ggr"].tracked is False
    assert row.values["ggr"].value is None

    # status filter only applies to the "bonus" dimension count query
    count_call = cur.execute.call_args_list[0]
    assert "c.active = 1" not in count_call.args[0]  # no status filter when status=None


async def test_custom_report_bonus_dimension_applies_status_filter(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.return_value = (3,)
    cur.fetchall.return_value = []

    await get_custom_report(217, "bonus", ["redemptions"], "active", _NOW, _NOW, limit=50, offset=0)

    count_call = cur.execute.call_args_list[0]
    assert "c.active = 1" in count_call.args[0]


async def test_custom_report_player_dimension_resolves_external_ids_and_null_budget(
    cur: AsyncMock, patch_conn: MagicMock,
) -> None:
    cur.fetchone.return_value = (1,)
    cur.fetchall.side_effect = [
        [("70", "70", 5, 1, Decimal("200.00"), Decimal("1000.00"), Decimal("1500.00"), None, None)],
        [(70, "james_k")],
    ]

    result = await get_custom_report(
        217, "player", ["redemptions", "budget_used", "wagering_completion_pct"],
        None, _NOW, _NOW, limit=50, offset=0,
    )

    row = result.rows[0]
    assert row.dimension_label == "james_k"
    assert row.values["budget_used"].value is None
    assert row.values["budget_used"].tracked is True  # not "untracked" — just N/A for players
    assert row.values["wagering_completion_pct"].value == pytest.approx(66.7, abs=0.1)


async def test_custom_report_unknown_dimension_raises(cur: AsyncMock, patch_conn: MagicMock) -> None:
    with pytest.raises(ValueError):
        await get_custom_report(217, "bogus", ["redemptions"], None, _NOW, _NOW, limit=50, offset=0)
