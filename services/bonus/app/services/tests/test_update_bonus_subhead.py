"""Tests for update_bonus_subhead, upsert_owners, upsert_limits."""

from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import aiomysql
import pytest

from app.exceptions import (
    BonusSubheadDuplicateError,
    BonusSubheadNotFoundError,
    BonusSubheadValidationError,
    DatabaseError,
)
from app.models.bonus_head import (
    LimitUpsertItem,
    LimitsUpsertRequest,
    OwnerUpsertItem,
    OwnersUpsertRequest,
)
from app.models.bonus_subhead import BonusSubheadUpdate
from app.services.bonus_subhead_service import update_bonus_subhead, upsert_limits, upsert_owners

_NOW = datetime(2026, 5, 12, 10, 0, 0)
# (id, head_id, site_id, name, description, active, owner, created_by, updated_by, created_at, updated_at)
_SUBHEAD_ROW = (1, 10, 1, "First Deposit", "100% match", 1, "priya.sharma", "admin", "admin", _NOW, _NOW)
_SUBHEAD_META_ROW = (10, 1)  # (head_id, site_id) from _EXISTS_SUBHEAD_ID_SQL


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


# ===========================================================================
# update_bonus_subhead
# Execute sequence (3 cur.execute calls, 2 fetchones):
#   [0] SELECT pre-read             → fetchone → _SUBHEAD_ROW
#   [1] UPDATE (includes row_hash)
#   [2] SELECT post-read            → fetchone → _SUBHEAD_ROW
# ===========================================================================


async def test_update_name_and_active(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_ROW, _SUBHEAD_ROW]

    result = await update_bonus_subhead(
        1, BonusSubheadUpdate(name="Second Deposit", active=False, updated_by="ops.team")
    )

    assert result.id == 1
    patch_conn.commit.assert_awaited_once()
    assert cur.execute.await_count == 3
    update_call = cur.execute.await_args_list[1]
    sql: str = update_call.args[0]
    assert "`name`" in sql
    assert "`active`" in sql
    assert "`updated_by`" in sql
    assert "`row_hash`" in sql


async def test_update_description_to_null(cur: AsyncMock, patch_conn: MagicMock) -> None:
    updated_row = list(_SUBHEAD_ROW)
    updated_row[4] = None
    cur.fetchone.side_effect = [_SUBHEAD_ROW, tuple(updated_row)]

    result = await update_bonus_subhead(
        1, BonusSubheadUpdate(description=None, updated_by="admin")
    )

    assert result.description is None
    patch_conn.commit.assert_awaited_once()


async def test_update_only_updated_by(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_ROW, _SUBHEAD_ROW]

    await update_bonus_subhead(1, BonusSubheadUpdate(updated_by="new.actor"))

    update_call = cur.execute.await_args_list[1]
    sql: str = update_call.args[0]
    # Only updated_by and row_hash should be in SET clause
    assert "`updated_by`" in sql
    assert "`row_hash`" in sql
    assert "`name`" not in sql
    assert "`active`" not in sql


async def test_update_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusSubheadNotFoundError) as exc_info:
        await update_bonus_subhead(99, BonusSubheadUpdate(updated_by="admin"))

    assert exc_info.value.subhead_id == 99
    patch_conn.commit.assert_not_awaited()


async def test_update_numeric_owner_raises_before_db(cur: AsyncMock, patch_conn: MagicMock) -> None:
    with pytest.raises(BonusSubheadValidationError) as exc_info:
        await update_bonus_subhead(1, BonusSubheadUpdate(owner="123", updated_by="admin"))

    assert exc_info.value.field == "owner"
    cur.execute.assert_not_awaited()


async def test_update_duplicate_name_raises(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _SUBHEAD_ROW
    cur.execute.side_effect = [None, aiomysql.IntegrityError(1062, "Duplicate entry")]

    with pytest.raises(BonusSubheadDuplicateError):
        await update_bonus_subhead(1, BonusSubheadUpdate(name="Weekend Reload", updated_by="admin"))


async def test_update_db_error_raises_database_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _SUBHEAD_ROW
    cur.execute.side_effect = [None, RuntimeError("connection dropped")]

    with pytest.raises(DatabaseError):
        await update_bonus_subhead(1, BonusSubheadUpdate(updated_by="admin"))


async def test_update_row_hash_in_set_clause(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_ROW, _SUBHEAD_ROW]

    await update_bonus_subhead(1, BonusSubheadUpdate(active=False, updated_by="admin"))

    update_sql = cur.execute.await_args_list[1].args[0]
    assert "row_hash" in update_sql


# ===========================================================================
# upsert_owners
# Execute sequence (N=2 entries):
#   [0] SELECT head_id,site_id FROM bonus_subhead   → fetchone → _SUBHEAD_META_ROW
#   [1] UPSERT owner[0]
#   [2] UPSERT owner[1]
#   [3] SELECT owners final                         → fetchall → rows_after
# Total: 4 executes, 1 fetchone, 1 fetchall
# ===========================================================================

_OWNERS_REQUEST = OwnersUpsertRequest(
    owners=[
        OwnerUpsertItem(username="priya.sharma", role="OPS_LEAD", active=True),
        OwnerUpsertItem(username="arjun.mehta", role="CAMPAIGN_MANAGER", active=True),
    ],
    updated_by="admin",
)
_OWNERS_AFTER = (
    ("arjun.mehta", "CAMPAIGN_MANAGER", 1),
    ("priya.sharma", "OPS_LEAD", 1),
)


async def test_upsert_owners_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_META_ROW]
    cur.fetchall.side_effect = [_OWNERS_AFTER]

    result = await upsert_owners(1, _OWNERS_REQUEST)

    assert len(result) == 2
    assert cur.execute.await_count == 4
    patch_conn.commit.assert_awaited_once()


async def test_upsert_owners_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusSubheadNotFoundError):
        await upsert_owners(99, _OWNERS_REQUEST)

    patch_conn.commit.assert_not_awaited()


async def test_upsert_owners_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("lost connection")

    with pytest.raises(DatabaseError):
        await upsert_owners(1, _OWNERS_REQUEST)


# ===========================================================================
# upsert_limits
# Execute sequence (N=2 entries):
#   [0] SELECT head_id,site_id FROM bonus_subhead  → fetchone → _SUBHEAD_META_ROW
#   [1] UPSERT limit[0]
#   [2] UPSERT limit[1]
#   [3] SELECT budget final                        → fetchall → rows_after
# Total: 4 executes, 1 fetchone, 1 fetchall
# ===========================================================================

_LIMITS_REQUEST = LimitsUpsertRequest(
    limits=[
        LimitUpsertItem(period_type="DAILY", budget_limit=Decimal("5000")),
        LimitUpsertItem(period_type="MONTHLY", budget_limit=Decimal("50000")),
    ],
    updated_by="admin",
)
_BUDGET_AFTER = (
    ("DAILY", Decimal("5000.00"), Decimal("0.00"), None),
    ("MONTHLY", Decimal("50000.00"), Decimal("0.00"), None),
)


async def test_upsert_limits_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SUBHEAD_META_ROW]
    cur.fetchall.side_effect = [_BUDGET_AFTER]

    result = await upsert_limits(1, _LIMITS_REQUEST)

    assert len(result) == 2
    assert cur.execute.await_count == 4
    patch_conn.commit.assert_awaited_once()


async def test_upsert_limits_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusSubheadNotFoundError):
        await upsert_limits(99, _LIMITS_REQUEST)

    patch_conn.commit.assert_not_awaited()


async def test_upsert_limits_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("lost connection")

    with pytest.raises(DatabaseError):
        await upsert_limits(1, _LIMITS_REQUEST)


# ---------------------------------------------------------------------------
# Model validation
# ---------------------------------------------------------------------------


def test_owners_request_rejects_duplicate_usernames() -> None:
    with pytest.raises(Exception, match="duplicate username"):
        OwnersUpsertRequest(
            owners=[
                OwnerUpsertItem(username="priya.sharma", role="OPS_LEAD"),
                OwnerUpsertItem(username="priya.sharma", role="CAMPAIGN_MANAGER"),
            ],
            updated_by="admin",
        )


def test_owners_request_rejects_empty_list() -> None:
    with pytest.raises(Exception):
        OwnersUpsertRequest(owners=[], updated_by="admin")


def test_limits_request_rejects_duplicate_periods() -> None:
    with pytest.raises(Exception, match="duplicate period_type"):
        LimitsUpsertRequest(
            limits=[
                LimitUpsertItem(period_type="DAILY", budget_limit=Decimal("1000")),
                LimitUpsertItem(period_type="DAILY", budget_limit=Decimal("2000")),
            ],
            updated_by="admin",
        )
