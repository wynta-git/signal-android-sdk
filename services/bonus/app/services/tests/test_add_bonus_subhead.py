"""Tests for add_bonus_subhead — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import aiomysql
import pytest

from app.exceptions import BonusSubheadDuplicateError, BonusSubheadNotFoundError, BonusSubheadValidationError, DatabaseError
from app.models.bonus_subhead import BonusSubheadCreate
from app.services.bonus_subhead_service import add_bonus_subhead

_VALID = dict(head_id=10, site_id=1, name="First Deposit", owner="priya.sharma", created_by="admin")
_NOW = datetime(2026, 5, 12, 10, 0, 0)
# (id, head_id, site_id, name, description, active, owner, created_by, updated_by, created_at, updated_at)
_DB_ROW = (42, 10, 1, "First Deposit", None, 1, "priya.sharma", "admin", "admin", _NOW, _NOW)
_HEAD_SITE_ROW = (1,)  # SELECT site_id FROM bonus_head WHERE id=?


@pytest.fixture
def cur() -> AsyncMock:
    c = AsyncMock()
    c.lastrowid = 42
    return c


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
#   [0] SELECT site_id FROM bonus_head   → fetchone → _HEAD_SITE_ROW
#   [1] SELECT 1 FROM bonus_subhead      → fetchone → None (no dup)
#   [2] INSERT INTO bonus_subhead
#   [3] SELECT entry_hash FROM cl        → fetchone → None (genesis)
#   [4] INSERT INTO bonus_subhead_change_log
#   [5] SELECT FROM bonus_subhead        → fetchone → _DB_ROW
# ---------------------------------------------------------------------------


async def test_success_returns_response(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_HEAD_SITE_ROW, None, None, _DB_ROW]

    result = await add_bonus_subhead(BonusSubheadCreate(**_VALID))

    assert result.id == 42
    assert result.head_id == 10
    assert result.site_id == 1
    assert result.name == "First Deposit"
    assert result.description is None
    assert result.active is True
    assert result.owner == "priya.sharma"
    assert result.created_by == "admin"
    assert result.updated_by == "admin"
    assert result.created_at == _NOW
    patch_conn.commit.assert_awaited_once()
    assert cur.execute.await_count == 6


# ---------------------------------------------------------------------------
# Parent head not found
# ---------------------------------------------------------------------------


async def test_head_not_found_raises_subhead_not_found_error(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    cur.fetchone.return_value = None  # bonus_head not found

    with pytest.raises(BonusSubheadNotFoundError) as exc_info:
        await add_bonus_subhead(BonusSubheadCreate(**_VALID))

    assert exc_info.value.subhead_id == 10
    patch_conn.commit.assert_not_awaited()


# ---------------------------------------------------------------------------
# Duplicate (head_id, name)
# ---------------------------------------------------------------------------


async def test_duplicate_on_exists_check(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_HEAD_SITE_ROW, (1,)]  # head found, dup found

    with pytest.raises(BonusSubheadDuplicateError) as exc_info:
        await add_bonus_subhead(BonusSubheadCreate(**_VALID))

    assert exc_info.value.head_id == 10
    assert exc_info.value.name == "First Deposit"
    patch_conn.commit.assert_not_awaited()


async def test_integrity_error_1062_race_condition(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_HEAD_SITE_ROW, None]  # head found, no dup detected
    cur.execute.side_effect = [None, None, aiomysql.IntegrityError(1062, "Duplicate entry")]

    with pytest.raises(BonusSubheadDuplicateError):
        await add_bonus_subhead(BonusSubheadCreate(**_VALID))


# ---------------------------------------------------------------------------
# Business-rule validation fires before any DB call
# ---------------------------------------------------------------------------


async def test_numeric_owner_skips_db(cur: AsyncMock, patch_conn: MagicMock) -> None:
    with pytest.raises(BonusSubheadValidationError) as exc_info:
        await add_bonus_subhead(BonusSubheadCreate(**{**_VALID, "owner": "99"}))

    assert exc_info.value.field == "owner"
    cur.execute.assert_not_awaited()


async def test_numeric_created_by_skips_db(cur: AsyncMock, patch_conn: MagicMock) -> None:
    with pytest.raises(BonusSubheadValidationError) as exc_info:
        await add_bonus_subhead(BonusSubheadCreate(**{**_VALID, "created_by": "42"}))

    assert exc_info.value.field == "created_by"
    cur.execute.assert_not_awaited()


# ---------------------------------------------------------------------------
# DB error paths
# ---------------------------------------------------------------------------


async def test_integrity_error_non_1062_raises_database_error(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    cur.fetchone.side_effect = [_HEAD_SITE_ROW, None]
    cur.execute.side_effect = [None, None, aiomysql.IntegrityError(1045, "Access denied")]

    with pytest.raises(DatabaseError):
        await add_bonus_subhead(BonusSubheadCreate(**_VALID))


async def test_row_missing_after_insert_raises_database_error(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    # head found, no dup, prev_hash=None (genesis), post-insert SELECT=None
    cur.fetchone.side_effect = [_HEAD_SITE_ROW, None, None, None]

    with pytest.raises(DatabaseError, match="row could not be retrieved"):
        await add_bonus_subhead(BonusSubheadCreate(**_VALID))
