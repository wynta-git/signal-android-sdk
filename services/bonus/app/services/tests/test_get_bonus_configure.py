"""Tests for get_bonus_configure — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import BonusConfigureNotFoundError, DatabaseError
from app.services.bonus_configure_service import get_bonus_configure

_NOW   = datetime(2026, 5, 12, 10, 0, 0)
_START = date(2026, 1, 1)
_END   = date(2026, 12, 31)

_CONFIGURE_ROW = (
    1, 1, 1, "100pct Match", "First deposit bonus",
    _START, _END, "EVERYTIME",
    Decimal("2.00"), 5, "DEPOSIT_INSTANT",
    30, None,
    "CASH", "CASH",
    None, None, Decimal("5000.00"),
    0, 1, "admin", "admin", _NOW, _NOW,
)

# (id, code, max_amount, valid_from, valid_to, auto_apply, display_order, active, system_auto_apply)
_CODE_ROWS = (
    (1, "AUTO-1",    None, None, None, 0, 0, 1, None),
    (2, "WELCOME100", None, datetime(2026, 1, 1), datetime(2026, 12, 31), 0, 1, 1, 0),
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

    with patch("app.services.bonus_configure_service.get_connection", _fake_get_connection):
        yield conn


# ---------------------------------------------------------------------------
# Happy path
# Execute sequence:
#   [0] SELECT FROM bonus_configure → fetchone → _CONFIGURE_ROW
#   [1] SELECT FROM bonus_configure_code → fetchall → _CODE_ROWS
# ---------------------------------------------------------------------------


async def test_success_returns_detail(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _CONFIGURE_ROW
    cur.fetchall.return_value = _CODE_ROWS

    result = await get_bonus_configure(1)

    assert result.id == 1
    assert result.subhead_id == 1
    assert result.name == "100pct Match"
    assert result.wager_multiplier == Decimal("2.00")
    assert result.active is True
    assert len(result.codes) == 2
    assert result.codes[0].code == "AUTO-1"
    assert result.codes[1].code == "WELCOME100"
    assert result.codes[0].auto_apply is False


async def test_success_with_no_codes(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _CONFIGURE_ROW
    cur.fetchall.return_value = ()

    result = await get_bonus_configure(1)

    assert result.codes == []


# ---------------------------------------------------------------------------
# Not found
# ---------------------------------------------------------------------------


async def test_not_found_raises_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusConfigureNotFoundError) as exc_info:
        await get_bonus_configure(999)

    assert exc_info.value.configure_id == 999


# ---------------------------------------------------------------------------
# DB error
# ---------------------------------------------------------------------------


async def test_db_error_raises_database_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("connection lost")

    with pytest.raises(DatabaseError):
        await get_bonus_configure(1)
