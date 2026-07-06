"""Tests for get_bonus_head — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import BonusHeadNotFoundError, DatabaseError
from app.services.bonus_head_service import get_bonus_head

_NOW = datetime(2026, 5, 12, 10, 0, 0)

_HEAD_ROW = (1, 1, "Welcome", "First deposit bonuses", 1, "priya.sharma", "admin", "admin", _NOW, _NOW)
_OWNER_ROWS = (
    ("finance.lead", "FINANCE_APPROVER", 1),
    ("rahul.dev",    "OPS_LEAD",         1),
    ("sneha.ops",    "CAMPAIGN_MANAGER", 1),
)
_SUBHEAD_ROWS = (
    (1, "First Deposit",  "100% match on first deposit", 1, "priya.sharma"),
    (2, "Second Deposit", "50% match on second deposit", 1, "priya.sharma"),
)
_BUDGET_ROWS = (
    ("DAILY",   None,            Decimal("12400.00"), _NOW),
    ("WEEKLY",  Decimal("500000.00"), Decimal("87600.00"), _NOW),
    ("MONTHLY", Decimal("2000000.00"), Decimal("312000.00"), _NOW),
)


@pytest.fixture
def cur() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def patch_conn(cur: AsyncMock) -> MagicMock:
    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cur)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor_ctx
    conn.commit = AsyncMock()

    @asynccontextmanager
    async def _fake_get_connection(*_args, **_kwargs):
        yield conn

    with patch("app.services.bonus_head_service.get_connection", _fake_get_connection):
        yield conn


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_get_bonus_head_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _HEAD_ROW
    cur.fetchall.side_effect = [_OWNER_ROWS, _SUBHEAD_ROWS, _BUDGET_ROWS]

    result = await get_bonus_head(1)

    assert result.id == 1
    assert result.name == "Welcome"
    assert result.active is True
    assert result.created_at == _NOW

    assert len(result.owners) == 3
    assert result.owners[0].username == "finance.lead"
    assert result.owners[0].role == "FINANCE_APPROVER"
    assert result.owners[0].active is True

    assert len(result.subheads) == 2
    assert result.subheads[0].id == 1
    assert result.subheads[0].name == "First Deposit"
    assert result.subheads[1].active is True

    assert len(result.budget) == 3
    daily = result.budget[0]
    assert daily.period_type == "DAILY"
    assert daily.limit is None
    assert daily.used == Decimal("12400.00")

    weekly = result.budget[1]
    assert weekly.limit == Decimal("500000.00")
    assert weekly.used == Decimal("87600.00")


async def test_no_owners_or_subheads(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _HEAD_ROW
    cur.fetchall.side_effect = [(), (), _BUDGET_ROWS]

    result = await get_bonus_head(1)

    assert result.owners == []
    assert result.subheads == []
    assert len(result.budget) == 3


async def test_no_budget_limits_configured(cur: AsyncMock, patch_conn: MagicMock) -> None:
    """No rows in bonus_budget_limit for this head → empty budget list."""
    cur.fetchone.return_value = _HEAD_ROW
    cur.fetchall.side_effect = [_OWNER_ROWS, _SUBHEAD_ROWS, ()]

    result = await get_bonus_head(1)

    assert result.budget == []


async def test_budget_limit_configured_without_usage(cur: AsyncMock, patch_conn: MagicMock) -> None:
    """A configured limit with no matching bonus_budget_usage row still shows
    up (driven from bonus_budget_limit), with used defaulted to 0 instead of
    being silently dropped."""
    cur.fetchone.return_value = _HEAD_ROW
    unused_budget_rows = (("MONTHLY", Decimal("2000000.00"), Decimal("0"), None),)
    cur.fetchall.side_effect = [_OWNER_ROWS, _SUBHEAD_ROWS, unused_budget_rows]

    result = await get_bonus_head(1)

    assert len(result.budget) == 1
    assert result.budget[0].period_type == "MONTHLY"
    assert result.budget[0].limit == Decimal("2000000.00")
    assert result.budget[0].used == Decimal("0")
    assert result.budget[0].reset_at is None


# ---------------------------------------------------------------------------
# Not found
# ---------------------------------------------------------------------------


async def test_head_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusHeadNotFoundError) as exc_info:
        await get_bonus_head(999)

    assert exc_info.value.head_id == 999
    cur.fetchall.assert_not_awaited()


# ---------------------------------------------------------------------------
# DB error
# ---------------------------------------------------------------------------


async def test_db_error_raises_database_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = RuntimeError("connection reset")

    with pytest.raises(DatabaseError):
        await get_bonus_head(1)
