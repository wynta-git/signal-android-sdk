"""Tests for update_bonus_head, upsert_owners, upsert_limits."""

from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import aiomysql
import pytest

from app.exceptions import (
    BonusHeadDuplicateError,
    BonusHeadNotFoundError,
    BonusHeadValidationError,
    DatabaseError,
)
from app.models.bonus_head import (
    BonusHeadUpdate,
    LimitUpsertItem,
    LimitsUpsertRequest,
    OwnerUpsertItem,
    OwnersUpsertRequest,
)
from app.services.bonus_head_service import update_bonus_head, upsert_limits, upsert_owners

_NOW = datetime(2026, 5, 12, 10, 0, 0)
_HEAD_ROW = (1, 1, "Welcome", "First deposit bonuses", 1, "priya.sharma", "admin", "admin", _NOW, _NOW)
_SITE_ROW = (1,)  # _EXISTS_HEAD_SQL returns site_id only


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

    with patch("app.services.bonus_head_service.get_connection", _fake_get_connection):
        yield conn


# ===========================================================================
# update_bonus_head
# Execute sequence (3 cur.execute calls, 2 fetchones):
#   [0] SELECT pre-read (fetchone → HEAD_ROW)
#   [1] UPDATE (includes row_hash)
#   [2] SELECT post-read (fetchone → HEAD_ROW)
# ===========================================================================


async def test_update_name_and_active(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_HEAD_ROW, _HEAD_ROW]

    result = await update_bonus_head(
        1, BonusHeadUpdate(name="New Name", active=False, updated_by="ops.team")
    )

    assert result.id == 1
    patch_conn.commit.assert_awaited_once()
    update_call = cur.execute.await_args_list[1]
    sql: str = update_call.args[0]
    assert "`name`" in sql
    assert "`active`" in sql
    assert "`updated_by`" in sql
    assert "`row_hash`" in sql


async def test_update_description_to_null(cur: AsyncMock, patch_conn: MagicMock) -> None:
    updated_row = list(_HEAD_ROW)
    updated_row[3] = None
    cur.fetchone.side_effect = [_HEAD_ROW, tuple(updated_row)]

    result = await update_bonus_head(
        1, BonusHeadUpdate(description=None, updated_by="admin")
    )

    assert result.description is None
    update_call = cur.execute.await_args_list[1]
    assert "`description`" in update_call.args[0]


async def test_update_only_updated_by(cur: AsyncMock, patch_conn: MagicMock) -> None:
    """Sending only updated_by is valid — touches updated_at via MySQL ON UPDATE."""
    cur.fetchone.side_effect = [_HEAD_ROW, _HEAD_ROW]

    await update_bonus_head(1, BonusHeadUpdate(updated_by="ops.team"))

    update_call = cur.execute.await_args_list[1]
    sql: str = update_call.args[0]
    assert "UPDATE bonus_head SET" in sql
    assert "`updated_by`" in sql
    patch_conn.commit.assert_awaited_once()


async def test_update_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusHeadNotFoundError) as exc_info:
        await update_bonus_head(1, BonusHeadUpdate(updated_by="admin"))

    assert exc_info.value.head_id == 1
    patch_conn.commit.assert_not_awaited()


async def test_update_numeric_owner_raises(cur: AsyncMock, patch_conn: MagicMock) -> None:
    with pytest.raises(BonusHeadValidationError) as exc_info:
        await update_bonus_head(1, BonusHeadUpdate(owner="12345", updated_by="admin"))

    assert exc_info.value.field == "owner"
    cur.execute.assert_not_awaited()


async def test_update_duplicate_name_raises(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _HEAD_ROW
    # [0]=SELECT returns None (no raise), [1]=UPDATE raises IntegrityError
    cur.execute.side_effect = [None, aiomysql.IntegrityError(1062, "Duplicate entry")]

    with pytest.raises(BonusHeadDuplicateError):
        await update_bonus_head(1, BonusHeadUpdate(name="Reload", updated_by="admin"))


async def test_update_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _HEAD_ROW
    # [0]=SELECT returns None, [1]=UPDATE raises
    cur.execute.side_effect = [None, RuntimeError("disk full")]

    with pytest.raises(DatabaseError):
        await update_bonus_head(1, BonusHeadUpdate(name="XYZ", updated_by="admin"))


async def test_update_row_hash_included_in_set(cur: AsyncMock, patch_conn: MagicMock) -> None:
    """row_hash is always included in the UPDATE SET clause."""
    cur.fetchone.side_effect = [_HEAD_ROW, _HEAD_ROW]

    await update_bonus_head(1, BonusHeadUpdate(name="XYZ", updated_by="admin"))

    update_sql = cur.execute.await_args_list[1].args[0]
    assert "`row_hash`" in update_sql


# ===========================================================================
# upsert_owners
# Execute sequence (N=2 entries):
#   [0]  EXISTS_HEAD (fetchone → SITE_ROW)
#   [1]  UPSERT owner[0]
#   [2]  UPSERT owner[1]
#   [3]  SELECT_OWNERS final (fetchall → all owners)
# Total: 4 executes, 1 fetchone, 1 fetchall
# ===========================================================================

_OWNER_ROWS_AFTER = (
    ("finance.lead", "FINANCE_APPROVER", 1),
    ("rahul.dev",    "OPS_LEAD",         1),
    ("sneha.ops",    "CAMPAIGN_MANAGER", 0),
)


async def test_upsert_owners_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SITE_ROW]
    cur.fetchall.side_effect = [_OWNER_ROWS_AFTER]

    request = OwnersUpsertRequest(
        owners=[
            OwnerUpsertItem(username="rahul.dev", role="OPS_LEAD"),
            OwnerUpsertItem(username="sneha.ops", role="CAMPAIGN_MANAGER", active=False),
        ],
        updated_by="admin",
    )
    result = await upsert_owners(1, request)

    assert len(result) == 3
    assert result[1].username == "rahul.dev"
    assert result[1].role == "OPS_LEAD"
    assert result[2].active is False
    patch_conn.commit.assert_awaited_once()
    # EXISTS + 2×UPSERT + final SELECT = 4
    assert cur.execute.await_count == 4


async def test_upsert_owners_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusHeadNotFoundError):
        await upsert_owners(
            999,
            OwnersUpsertRequest(
                owners=[OwnerUpsertItem(username="rahul.dev", role="OPS_LEAD")],
                updated_by="admin",
            ),
        )
    patch_conn.commit.assert_not_awaited()


async def test_upsert_owners_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _SITE_ROW
    # [0]=EXISTS, [1]=UPSERT raises
    cur.execute.side_effect = [None, RuntimeError("connection reset")]

    with pytest.raises(DatabaseError):
        await upsert_owners(
            1,
            OwnersUpsertRequest(
                owners=[OwnerUpsertItem(username="rahul.dev", role="OPS_LEAD")],
                updated_by="admin",
            ),
        )


# ---------------------------------------------------------------------------
# OwnersUpsertRequest model validation
# ---------------------------------------------------------------------------


def test_owners_request_rejects_duplicate_usernames() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="duplicate username"):
        OwnersUpsertRequest(
            owners=[
                OwnerUpsertItem(username="rahul.dev", role="OPS_LEAD"),
                OwnerUpsertItem(username="rahul.dev", role="CAMPAIGN_MANAGER"),
            ],
            updated_by="admin",
        )


def test_owners_request_rejects_empty_list() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        OwnersUpsertRequest(owners=[], updated_by="admin")


def test_owners_request_rejects_invalid_role() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        OwnersUpsertRequest(
            owners=[OwnerUpsertItem(username="rahul.dev", role="UNKNOWN_ROLE")],  # type: ignore[arg-type]
            updated_by="admin",
        )


# ===========================================================================
# upsert_limits
# Execute sequence (N=2 entries):
#   [0]  EXISTS_HEAD (fetchone → SITE_ROW)
#   [1]  UPSERT limit[0]
#   [2]  UPSERT limit[1]
#   [3]  SELECT_BUDGET final (fetchall → all budget rows)
# Total: 4 executes, 1 fetchone, 1 fetchall
# ===========================================================================

_BUDGET_ROWS_AFTER = (
    ("DAILY",   None,                  Decimal("12400.00"),  _NOW),
    ("WEEKLY",  Decimal("600000.00"),  Decimal("87600.00"),  _NOW),
    ("MONTHLY", Decimal("2000000.00"), Decimal("312000.00"), _NOW),
)


async def test_upsert_limits_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_SITE_ROW]
    cur.fetchall.side_effect = [_BUDGET_ROWS_AFTER]

    request = LimitsUpsertRequest(
        limits=[
            LimitUpsertItem(period_type="DAILY", budget_limit=None),
            LimitUpsertItem(period_type="WEEKLY", budget_limit=Decimal("600000.00")),
        ],
        updated_by="admin",
    )
    result = await upsert_limits(1, request)

    assert len(result) == 3
    assert result[0].period_type == "DAILY"
    assert result[0].limit is None
    assert result[1].limit == Decimal("600000.00")
    patch_conn.commit.assert_awaited_once()
    # EXISTS + 2×UPSERT + final SELECT = 4
    assert cur.execute.await_count == 4


async def test_upsert_limits_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(BonusHeadNotFoundError):
        await upsert_limits(
            999,
            LimitsUpsertRequest(
                limits=[LimitUpsertItem(period_type="DAILY")],
                updated_by="admin",
            ),
        )
    patch_conn.commit.assert_not_awaited()


async def test_upsert_limits_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _SITE_ROW
    # [0]=EXISTS, [1]=UPSERT raises
    cur.execute.side_effect = [None, RuntimeError("timeout")]

    with pytest.raises(DatabaseError):
        await upsert_limits(
            1,
            LimitsUpsertRequest(
                limits=[LimitUpsertItem(period_type="MONTHLY", budget_limit=Decimal("1000000"))],
                updated_by="admin",
            ),
        )


# ---------------------------------------------------------------------------
# LimitsUpsertRequest model validation
# ---------------------------------------------------------------------------


def test_limits_request_rejects_duplicate_periods() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="duplicate period_type"):
        LimitsUpsertRequest(
            limits=[
                LimitUpsertItem(period_type="DAILY"),
                LimitUpsertItem(period_type="DAILY", budget_limit=Decimal("1000")),
            ],
            updated_by="admin",
        )


def test_limits_request_rejects_empty_list() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        LimitsUpsertRequest(limits=[], updated_by="admin")


def test_limits_request_rejects_invalid_period() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        LimitsUpsertRequest(
            limits=[LimitUpsertItem(period_type="YEARLY")],  # type: ignore[arg-type]
            updated_by="admin",
        )


def test_limits_request_rejects_negative_limit() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        LimitsUpsertRequest(
            limits=[LimitUpsertItem(period_type="DAILY", budget_limit=Decimal("-1"))],
            updated_by="admin",
        )
