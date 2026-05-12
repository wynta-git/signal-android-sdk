"""Tests for add_bonus_head — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import aiomysql
import pytest

from app.exceptions import BonusHeadDuplicateError, BonusHeadValidationError, DatabaseError
from app.models.bonus_head import BonusHeadCreate
from app.services.bonus_head_service import add_bonus_head

_VALID = dict(site_id=1, name="Welcome", owner="priya.sharma", created_by="admin")
_NOW = datetime(2026, 5, 12, 10, 0, 0)
_DB_ROW = (42, 1, "Welcome", None, 1, "priya.sharma", "admin", "admin", _NOW, _NOW)


@pytest.fixture
def cur() -> AsyncMock:
    c = AsyncMock()
    c.lastrowid = 42
    return c


@pytest.fixture
def patch_conn(cur: AsyncMock) -> MagicMock:
    # conn.cursor() must be a sync call returning an async context manager,
    # so use MagicMock (not AsyncMock) for conn itself.
    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cur)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor_ctx
    conn.commit = AsyncMock()

    @asynccontextmanager
    async def _fake_get_connection():
        yield conn

    with patch("app.services.bonus_head_service.get_connection", _fake_get_connection):
        yield conn


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_success_returns_response(cur: AsyncMock, patch_conn: AsyncMock) -> None:
    # fetchone: [0] EXISTS=None, [1] GET_PREV_HASH=None, [2] post-insert SELECT=_DB_ROW
    cur.fetchone.side_effect = [None, None, _DB_ROW]

    result = await add_bonus_head(BonusHeadCreate(**_VALID))

    assert result.id == 42
    assert result.site_id == 1
    assert result.name == "Welcome"
    assert result.description is None
    assert result.active is True
    assert result.owner == "priya.sharma"
    assert result.created_by == "admin"
    assert result.updated_by == "admin"
    assert result.created_at == _NOW
    patch_conn.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------


async def test_duplicate_on_exists_check(cur: AsyncMock, patch_conn: AsyncMock) -> None:
    cur.fetchone.return_value = (1,)

    with pytest.raises(BonusHeadDuplicateError) as exc_info:
        await add_bonus_head(BonusHeadCreate(**_VALID))

    assert exc_info.value.site_id == 1
    assert exc_info.value.name == "Welcome"
    patch_conn.commit.assert_not_awaited()


async def test_integrity_error_1062_race_condition(cur: AsyncMock, patch_conn: AsyncMock) -> None:
    # EXISTS check passes, but INSERT races to a duplicate
    cur.fetchone.return_value = None
    cur.execute.side_effect = [None, aiomysql.IntegrityError(1062, "Duplicate entry")]

    with pytest.raises(BonusHeadDuplicateError):
        await add_bonus_head(BonusHeadCreate(**_VALID))


# ---------------------------------------------------------------------------
# Business-rule validation fires before any DB call
# ---------------------------------------------------------------------------


async def test_numeric_owner_skips_db(cur: AsyncMock, patch_conn: AsyncMock) -> None:
    with pytest.raises(BonusHeadValidationError) as exc_info:
        await add_bonus_head(BonusHeadCreate(**{**_VALID, "owner": "99"}))

    assert exc_info.value.field == "owner"
    cur.execute.assert_not_awaited()


async def test_numeric_created_by_skips_db(cur: AsyncMock, patch_conn: AsyncMock) -> None:
    with pytest.raises(BonusHeadValidationError) as exc_info:
        await add_bonus_head(BonusHeadCreate(**{**_VALID, "created_by": "42"}))

    assert exc_info.value.field == "created_by"
    cur.execute.assert_not_awaited()


# ---------------------------------------------------------------------------
# DB error paths
# ---------------------------------------------------------------------------


async def test_integrity_error_non_1062_raises_database_error(
    cur: AsyncMock, patch_conn: AsyncMock
) -> None:
    cur.fetchone.return_value = None
    cur.execute.side_effect = [None, aiomysql.IntegrityError(1045, "Access denied")]

    with pytest.raises(DatabaseError):
        await add_bonus_head(BonusHeadCreate(**_VALID))


async def test_generic_exception_raises_database_error(
    cur: AsyncMock, patch_conn: AsyncMock
) -> None:
    cur.fetchone.return_value = None
    cur.execute.side_effect = [None, RuntimeError("connection lost")]

    with pytest.raises(DatabaseError):
        await add_bonus_head(BonusHeadCreate(**_VALID))


async def test_row_missing_after_insert_raises_database_error(
    cur: AsyncMock, patch_conn: AsyncMock
) -> None:
    # EXISTS=None, GET_PREV_HASH=None, post-insert SELECT=None → error
    cur.fetchone.side_effect = [None, None, None]

    with pytest.raises(DatabaseError, match="row could not be retrieved"):
        await add_bonus_head(BonusHeadCreate(**_VALID))
