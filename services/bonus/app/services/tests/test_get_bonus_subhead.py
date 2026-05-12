"""Tests for get_bonus_subhead — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import BonusSubheadNotFoundError, DatabaseError
from app.services.bonus_subhead_service import get_bonus_subhead

_NOW = datetime(2026, 5, 12, 10, 0, 0)
# (id, head_id, site_id, name, description, active, owner, created_by, updated_by, created_at, updated_at)
_SUBHEAD_ROW = (1, 10, 1, "First Deposit", "100% match bonus", 1, "priya.sharma", "admin", "admin", _NOW, _NOW)
_OWNER_ROWS = (
    ("priya.sharma", "OPS_LEAD", 1),
    ("arjun.mehta", "CAMPAIGN_MANAGER", 1),
)
_BUDGET_ROWS = (
    ("DAILY", Decimal("5000.00"), Decimal("1200.00"), None),
    ("MONTHLY", Decimal("50000.00"), Decimal("12000.00"), None),
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
    async def _fake_get_connection():
        yield conn

    with patch("app.services.bonus_subhead_service.get_connection", _fake_get_connection):
        yield conn


# ---------------------------------------------------------------------------
# Happy path
# Execute sequence:
#   [0] SELECT FROM bonus_subhead   → fetchone → _SUBHEAD_ROW
#   [1] SELECT owners               → fetchall → _OWNER_ROWS
#   [2] SELECT budget               → fetchall → _BUDGET_ROWS
# ---------------------------------------------------------------------------


async def test_success_returns_detail(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _SUBHEAD_ROW
    cur.fetchall.side_effect = [_OWNER_ROWS, _BUDGET_ROWS]

    result = await get_bonus_subhead(1)

    assert result.id == 1
    assert result.head_id == 10
    assert result.site_id == 1
    assert result.name == "First Deposit"
    assert result.active is True
    assert len(result.owners) == 2
    assert result.owners[0].username == "priya.sharma"
    assert result.owners[0].role == "OPS_LEAD"
    assert len(result.budget) == 2
    assert result.budget[0].period_type == "DAILY"
    assert result.budget[0].limit == Decimal("5000.00")
    assert result.budget[0].used == Decimal("1200.00")


async def test_success_with_no_owners_or_budget(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _SUBHEAD_ROW
    cur.fetchall.side_effect = [(), ()]

    result = await get_bonus_subhead(1)

    assert result.owners == []
    assert result.budget == []


# ---------------------------------------------------------------------------
# Not found
# ---------------------------------------------------------------------------


async def test_not_found_raises_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusSubheadNotFoundError) as exc_info:
        await get_bonus_subhead(99)

    assert exc_info.value.subhead_id == 99


# ---------------------------------------------------------------------------
# DB error
# ---------------------------------------------------------------------------


async def test_db_error_raises_database_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("connection lost")

    with pytest.raises(DatabaseError):
        await get_bonus_subhead(1)
