"""Tests for add_bonus_configure — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import aiomysql
import pytest

from app.exceptions import BonusConfigureDuplicateError, BonusConfigureNotFoundError, BonusConfigureValidationError, DatabaseError
from app.models.bonus_configure import BonusConfigureCreate
from app.services.bonus_configure_service import add_bonus_configure

_NOW   = datetime(2026, 5, 12, 10, 0, 0)
_START = date(2026, 1, 1)
_END   = date(2026, 12, 31)

_VALID = dict(
    subhead_id=1, site_id=1, name="100pct Match",
    start_date=_START, end_date=_END,
    wager_multiplier=Decimal("2.00"), no_of_chunks=5,
    wager_chip_type="CASH", credit_chip_type="CASH",
    created_by="admin",
)

# (id, subhead_id, site_id, name, description,
#  start_date, end_date, applicability_frequency,
#  wager_multiplier, no_of_chunks, release_bucket,
#  chunk_expiry_days, bonus_expiry_days,
#  wager_chip_type, credit_chip_type,
#  bonus_amount_fixed, bonus_amount_percent, bonus_amount_max,
#  priority, active, created_by, updated_by, created_at, updated_at)
_DB_ROW = (
    10, 1, 1, "100pct Match", None,
    _START, _END, "EVERYTIME",
    Decimal("2.00"), 5, None,
    None, None,
    "CASH", "CASH",
    None, None, None,
    0, 1, "admin", "admin", _NOW, _NOW,
)

_SUBHEAD_SITE_ROW = (1,)  # SELECT site_id FROM bonus_subhead WHERE id = ?


@pytest.fixture
def cur() -> AsyncMock:
    c = AsyncMock()
    c.lastrowid = 10  # configure id; code will get next rowid — doesn't matter for these tests
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

    with patch("app.services.bonus_configure_service.get_connection", _fake_get_connection):
        yield conn


# ---------------------------------------------------------------------------
# Happy path
# Execute sequence (9 cur.execute calls, 5 fetchones):
#   [0] SELECT site_id FROM bonus_subhead   → fetchone → _SUBHEAD_SITE_ROW
#   [1] SELECT 1 FROM bonus_configure (dup) → fetchone → None
#   [2] INSERT INTO bonus_configure
#   [3] SELECT entry_hash from cl           → fetchone → None (genesis)
#   [4] INSERT INTO bonus_configure_change_log
#   [5] INSERT INTO bonus_configure_code
#   [6] SELECT entry_hash from code cl      → fetchone → None (genesis)
#   [7] INSERT INTO bonus_configure_code_change_log
#   [8] SELECT FROM bonus_configure         → fetchone → _DB_ROW
# ---------------------------------------------------------------------------


async def test_success_returns_response(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_SITE_ROW, None, None, None, _DB_ROW]

    result = await add_bonus_configure(BonusConfigureCreate(**_VALID))

    assert result.id == 10
    assert result.subhead_id == 1
    assert result.name == "100pct Match"
    assert result.active is True
    assert result.created_by == "admin"
    patch_conn.commit.assert_awaited_once()
    assert cur.execute.await_count == 9


async def test_default_code_inserted(cur: AsyncMock, patch_conn: MagicMock) -> None:
    """The default AUTO-{id} code insert must be the 6th execute call (index 5)."""
    cur.fetchone.side_effect = [_SUBHEAD_SITE_ROW, None, None, None, _DB_ROW]

    await add_bonus_configure(BonusConfigureCreate(**_VALID))

    code_insert = cur.execute.await_args_list[5]
    sql: str = code_insert.args[0]
    params = code_insert.args[1]
    assert "bonus_configure_code" in sql
    assert "INSERT INTO" in sql
    # code value is AUTO-10
    assert params[2] == "AUTO-10"
    assert params[6] == 1   # active


# ---------------------------------------------------------------------------
# Parent subhead not found
# ---------------------------------------------------------------------------


async def test_subhead_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None  # bonus_subhead not found

    with pytest.raises(BonusConfigureNotFoundError) as exc_info:
        await add_bonus_configure(BonusConfigureCreate(**_VALID))

    assert exc_info.value.configure_id == 1  # subhead_id used as the "missing" id
    patch_conn.commit.assert_not_awaited()


# ---------------------------------------------------------------------------
# Duplicate (subhead_id, name)
# ---------------------------------------------------------------------------


async def test_duplicate_on_exists_check(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_SITE_ROW, (1,)]  # subhead ok, dup found

    with pytest.raises(BonusConfigureDuplicateError) as exc_info:
        await add_bonus_configure(BonusConfigureCreate(**_VALID))

    assert exc_info.value.subhead_id == 1
    assert exc_info.value.name == "100pct Match"
    patch_conn.commit.assert_not_awaited()


async def test_integrity_error_1062_race_condition(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_SITE_ROW, None]
    cur.execute.side_effect = [None, None, aiomysql.IntegrityError(1062, "Duplicate entry")]

    with pytest.raises(BonusConfigureDuplicateError):
        await add_bonus_configure(BonusConfigureCreate(**_VALID))


# ---------------------------------------------------------------------------
# Business-rule validation
# ---------------------------------------------------------------------------


async def test_numeric_created_by_skips_db(cur: AsyncMock, patch_conn: MagicMock) -> None:
    with pytest.raises(BonusConfigureValidationError) as exc_info:
        await add_bonus_configure(BonusConfigureCreate(**{**_VALID, "created_by": "42"}))

    assert exc_info.value.field == "created_by"
    cur.execute.assert_not_awaited()


def test_end_date_before_start_date_rejected() -> None:
    with pytest.raises(Exception, match="end_date"):
        BonusConfigureCreate(**{
            **_VALID,
            "start_date": date(2026, 6, 1),
            "end_date":   date(2026, 1, 1),
        })


def test_blank_description_rejected() -> None:
    with pytest.raises(Exception, match="description"):
        BonusConfigureCreate(**{**_VALID, "description": "   "})


def test_negative_wager_multiplier_rejected() -> None:
    with pytest.raises(Exception):
        BonusConfigureCreate(**{**_VALID, "wager_multiplier": Decimal("-1")})


# ---------------------------------------------------------------------------
# DB error paths
# ---------------------------------------------------------------------------


async def test_non_1062_integrity_error_raises_database_error(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_SITE_ROW, None]
    cur.execute.side_effect = [None, None, aiomysql.IntegrityError(1045, "Access denied")]

    with pytest.raises(DatabaseError):
        await add_bonus_configure(BonusConfigureCreate(**_VALID))


async def test_row_missing_after_insert_raises_database_error(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    # subhead ok, no dup, two prev_hash lookups return None, post-insert SELECT returns None
    cur.fetchone.side_effect = [_SUBHEAD_SITE_ROW, None, None, None, None]

    with pytest.raises(DatabaseError, match="row could not be retrieved"):
        await add_bonus_configure(BonusConfigureCreate(**_VALID))
