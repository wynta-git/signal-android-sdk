"""Tests for update_bonus_configure."""

from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import aiomysql
import pytest

from app.exceptions import BonusConfigureDuplicateError, BonusConfigureNotFoundError, DatabaseError
from app.models.bonus_configure import BonusConfigureUpdate
from app.services.bonus_configure_service import update_bonus_configure

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
    None, None, None,
    0, 1, "admin", "admin", _NOW, _NOW,
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


# ===========================================================================
# update_bonus_configure
# Execute sequence (3 cur.execute calls, 2 fetchones):
#   [0] SELECT pre-read              → fetchone → _CONFIGURE_ROW
#   [1] UPDATE bonus_configure
#   [2] SELECT post-read             → fetchone → _CONFIGURE_ROW
# ===========================================================================


async def test_update_name_and_active(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_CONFIGURE_ROW, _CONFIGURE_ROW]

    result = await update_bonus_configure(
        1, BonusConfigureUpdate(name="150pct Match", active=False, updated_by="ops.team")
    )

    assert result.id == 1
    patch_conn.commit.assert_awaited_once()
    assert cur.execute.await_count == 3
    update_sql: str = cur.execute.await_args_list[1].args[0]
    assert "`name`" in update_sql
    assert "`active`" in update_sql
    assert "`updated_by`" in update_sql
    assert "`row_hash`" in update_sql


async def test_update_clear_description(cur: AsyncMock, patch_conn: MagicMock) -> None:
    updated = list(_CONFIGURE_ROW)
    updated[4] = None
    cur.fetchone.side_effect = [_CONFIGURE_ROW, tuple(updated)]

    result = await update_bonus_configure(
        1, BonusConfigureUpdate(description=None, updated_by="admin")
    )

    assert result.description is None


async def test_update_bonus_amount_max(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_CONFIGURE_ROW, _CONFIGURE_ROW]

    await update_bonus_configure(
        1, BonusConfigureUpdate(bonus_amount_max=Decimal("10000.00"), updated_by="admin")
    )

    update_sql: str = cur.execute.await_args_list[1].args[0]
    assert "`bonus_amount_max`" in update_sql


async def test_update_dates(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_CONFIGURE_ROW, _CONFIGURE_ROW]

    await update_bonus_configure(
        1,
        BonusConfigureUpdate(
            start_date=date(2026, 6, 1),
            end_date=date(2026, 12, 31),
            updated_by="admin",
        ),
    )

    update_sql: str = cur.execute.await_args_list[1].args[0]
    assert "`start_date`" in update_sql
    assert "`end_date`" in update_sql


async def test_update_only_updated_by(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_CONFIGURE_ROW, _CONFIGURE_ROW]

    await update_bonus_configure(1, BonusConfigureUpdate(updated_by="new.actor"))

    update_sql: str = cur.execute.await_args_list[1].args[0]
    assert "`updated_by`" in update_sql
    assert "`row_hash`" in update_sql
    assert "`name`" not in update_sql
    assert "`active`" not in update_sql


async def test_update_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusConfigureNotFoundError) as exc_info:
        await update_bonus_configure(99, BonusConfigureUpdate(updated_by="admin"))

    assert exc_info.value.configure_id == 99
    patch_conn.commit.assert_not_awaited()


async def test_update_duplicate_name_raises(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _CONFIGURE_ROW
    cur.execute.side_effect = [None, aiomysql.IntegrityError(1062, "Duplicate entry")]

    with pytest.raises(BonusConfigureDuplicateError):
        await update_bonus_configure(1, BonusConfigureUpdate(name="Weekend Flat", updated_by="admin"))


async def test_update_db_error_raises_database_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _CONFIGURE_ROW
    cur.execute.side_effect = [None, RuntimeError("lost connection")]

    with pytest.raises(DatabaseError):
        await update_bonus_configure(1, BonusConfigureUpdate(updated_by="admin"))


async def test_update_row_hash_in_set_clause(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_CONFIGURE_ROW, _CONFIGURE_ROW]

    await update_bonus_configure(1, BonusConfigureUpdate(priority=5, updated_by="admin"))

    assert "row_hash" in cur.execute.await_args_list[1].args[0]


# ---------------------------------------------------------------------------
# Model validation
# ---------------------------------------------------------------------------


def test_end_date_before_start_date_rejected() -> None:
    with pytest.raises(Exception, match="end_date"):
        BonusConfigureUpdate(
            start_date=date(2026, 6, 1),
            end_date=date(2026, 1, 1),
            updated_by="admin",
        )


def test_blank_description_rejected() -> None:
    with pytest.raises(Exception, match="description"):
        BonusConfigureUpdate(description="   ", updated_by="admin")


def test_negative_wager_multiplier_rejected() -> None:
    with pytest.raises(Exception):
        BonusConfigureUpdate(wager_multiplier=Decimal("-0.01"), updated_by="admin")


def test_zero_no_of_chunks_rejected() -> None:
    with pytest.raises(Exception):
        BonusConfigureUpdate(no_of_chunks=0, updated_by="admin")


def test_negative_priority_rejected() -> None:
    with pytest.raises(Exception):
        BonusConfigureUpdate(priority=-1, updated_by="admin")
