"""Tests for update_bonus_head, upsert_owners, upsert_limits."""

from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, call, patch

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


def _cl_insert_calls(cur: AsyncMock) -> list:
    """Return execute calls that inserted into a _change_log table."""
    return [
        c for c in cur.execute.await_args_list
        if "_change_log" in c.args[0] and "INSERT INTO" in c.args[0]
    ]


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
# Execute sequence:
#   [0] SELECT pre-read (fetchone → HEAD_ROW)
#   [1] UPDATE (includes row_hash)
#   [2] SELECT entry_hash from bonus_head_change_log (fetchone → prev_hash)
#   [3] INSERT INTO bonus_head_change_log
#   [4] commit
#   [5] SELECT post-read (fetchone → HEAD_ROW)
# Total: 6 executes, 3 fetchones
# ===========================================================================


async def test_update_name_and_active(cur: AsyncMock, patch_conn: MagicMock) -> None:
    # [pre-read HEAD_ROW, prev_hash=None (genesis), post-read HEAD_ROW]
    cur.fetchone.side_effect = [_HEAD_ROW, None, _HEAD_ROW]

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
    cur.fetchone.side_effect = [_HEAD_ROW, None, tuple(updated_row)]

    result = await update_bonus_head(
        1, BonusHeadUpdate(description=None, updated_by="admin")
    )

    assert result.description is None
    update_call = cur.execute.await_args_list[1]
    assert "`description`" in update_call.args[0]


async def test_update_only_updated_by(cur: AsyncMock, patch_conn: MagicMock) -> None:
    """Sending only updated_by is valid — touches updated_at via MySQL ON UPDATE."""
    cur.fetchone.side_effect = [_HEAD_ROW, None, _HEAD_ROW]

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
        await update_bonus_head(1, BonusHeadUpdate(name="X", updated_by="admin"))


async def test_update_change_log_written(cur: AsyncMock, patch_conn: MagicMock) -> None:
    """Change log entry is written with a 64-char entry_hash and correct metadata."""
    cur.fetchone.side_effect = [_HEAD_ROW, None, _HEAD_ROW]

    await update_bonus_head(1, BonusHeadUpdate(name="New Name", updated_by="ops.team"))

    inserts = _cl_insert_calls(cur)
    assert len(inserts) == 1
    params = inserts[0].args[1]
    # entity_id, site_id, action, changed_by, changed_at, old_json, new_json, prev_hash, entry_hash
    assert params[0] == 1              # entity_id
    assert params[1] == 1              # site_id
    assert params[2] == "UPDATE"       # action
    assert params[3] == "ops.team"     # changed_by
    assert params[7] is None           # prev_hash — genesis (mock returns None)
    assert len(params[8]) == 64        # entry_hash is SHA-256 hex


async def test_update_row_hash_included_in_set(cur: AsyncMock, patch_conn: MagicMock) -> None:
    """row_hash is always included in the UPDATE SET clause."""
    cur.fetchone.side_effect = [_HEAD_ROW, None, _HEAD_ROW]

    await update_bonus_head(1, BonusHeadUpdate(name="X", updated_by="admin"))

    update_sql = cur.execute.await_args_list[1].args[0]
    assert "`row_hash`" in update_sql


# ===========================================================================
# upsert_owners
# Execute sequence per entry (N entries):
#   [0]    EXISTS_HEAD (fetchone → SITE_ROW)
#   [1]    SELECT_OWNERS pre-read (fetchall → existing owners)
#   [2..N] per entry: UPSERT + GET_PREV_HASH (fetchone) + INSERT_CL
#   [last] SELECT_OWNERS final (fetchall → all owners)
# For N=2: 1 + 1 + 2×3 + 1 = 9 executes; 3 fetchones (EXISTS + 2 prev_hash)
# ===========================================================================

_OWNER_ROWS_AFTER = (
    ("finance.lead", "FINANCE_APPROVER", 1),
    ("rahul.dev",    "OPS_LEAD",         1),
    ("sneha.ops",    "CAMPAIGN_MANAGER", 0),
)


async def test_upsert_owners_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    # fetchone: EXISTS=SITE_ROW, prev_hash entry1=None, prev_hash entry2=None
    cur.fetchone.side_effect = [_SITE_ROW, None, None]
    cur.fetchall.side_effect = [(), _OWNER_ROWS_AFTER]

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
    # EXISTS + pre-read + 2×(UPSERT + GET_PREV_HASH + INSERT_CL) + final SELECT = 9
    assert cur.execute.await_count == 9


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
    cur.fetchall.return_value = ()
    # [0]=EXISTS, [1]=pre-read SELECT, [2]=UPSERT raises
    cur.execute.side_effect = [None, None, RuntimeError("connection reset")]

    with pytest.raises(DatabaseError):
        await upsert_owners(
            1,
            OwnersUpsertRequest(
                owners=[OwnerUpsertItem(username="rahul.dev", role="OPS_LEAD")],
                updated_by="admin",
            ),
        )


async def test_upsert_owners_audit_insert_for_new_username(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    """Owner not in pre-read → INSERT change log entry, no old_values, 64-char entry_hash."""
    cur.fetchone.side_effect = [_SITE_ROW, None]
    cur.fetchall.side_effect = [(), (("rahul.dev", "OPS_LEAD", 1),)]

    await upsert_owners(
        1,
        OwnersUpsertRequest(
            owners=[OwnerUpsertItem(username="rahul.dev", role="OPS_LEAD")],
            updated_by="admin",
        ),
    )

    inserts = _cl_insert_calls(cur)
    assert len(inserts) == 1
    params = inserts[0].args[1]
    assert params[2] == "INSERT"
    assert params[5] is None          # old_values NULL for INSERT
    assert len(params[8]) == 64       # entry_hash is 64-char hex


async def test_upsert_owners_audit_update_for_existing_username(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    """Owner found in pre-read → UPDATE change log entry with old values, chained hash."""
    cur.fetchone.side_effect = [_SITE_ROW, None]
    cur.fetchall.side_effect = [
        (("rahul.dev", "OPS_LEAD", 1),),           # pre-read: rahul exists
        (("rahul.dev", "FINANCE_APPROVER", 1),),    # final read after upsert
    ]

    await upsert_owners(
        1,
        OwnersUpsertRequest(
            owners=[OwnerUpsertItem(username="rahul.dev", role="FINANCE_APPROVER")],
            updated_by="admin",
        ),
    )

    inserts = _cl_insert_calls(cur)
    assert len(inserts) == 1
    params = inserts[0].args[1]
    assert params[2] == "UPDATE"
    assert params[5] is not None      # old_values present
    assert len(params[8]) == 64       # entry_hash is 64-char hex


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
# Execute sequence per entry (N entries):
#   [0]    EXISTS_HEAD (fetchone → SITE_ROW)
#   [1]    SELECT_LIMITS_PRE (fetchall → existing limits)
#   [2..N] per entry: UPSERT + GET_PREV_HASH (fetchone) + INSERT_CL
#   [last] SELECT_BUDGET final (fetchall → all budget rows)
# For N=2: 1 + 1 + 2×3 + 1 = 9 executes; 3 fetchones (EXISTS + 2 prev_hash)
# ===========================================================================

_BUDGET_ROWS_AFTER = (
    ("DAILY",   None,                  Decimal("12400.00"),  _NOW),
    ("WEEKLY",  Decimal("600000.00"),  Decimal("87600.00"),  _NOW),
    ("MONTHLY", Decimal("2000000.00"), Decimal("312000.00"), _NOW),
)


async def test_upsert_limits_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    # fetchone: EXISTS=SITE_ROW, prev_hash entry1=None, prev_hash entry2=None
    cur.fetchone.side_effect = [_SITE_ROW, None, None]
    cur.fetchall.side_effect = [(), _BUDGET_ROWS_AFTER]

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
    # EXISTS + pre-read + 2×(UPSERT + GET_PREV_HASH + INSERT_CL) + final SELECT = 9
    assert cur.execute.await_count == 9


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
    cur.fetchall.return_value = ()
    # [0]=EXISTS, [1]=pre-read SELECT, [2]=UPSERT raises
    cur.execute.side_effect = [None, None, RuntimeError("timeout")]

    with pytest.raises(DatabaseError):
        await upsert_limits(
            1,
            LimitsUpsertRequest(
                limits=[LimitUpsertItem(period_type="MONTHLY", budget_limit=Decimal("1000000"))],
                updated_by="admin",
            ),
        )


async def test_upsert_limits_audit_insert_for_new_period(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    """Period not in pre-read → INSERT change log entry, no old_values, 64-char entry_hash."""
    cur.fetchone.side_effect = [_SITE_ROW, None]
    cur.fetchall.side_effect = [(), (("DAILY", None, Decimal("0.00"), _NOW),)]

    await upsert_limits(
        1,
        LimitsUpsertRequest(
            limits=[LimitUpsertItem(period_type="DAILY", budget_limit=None)],
            updated_by="admin",
        ),
    )

    inserts = _cl_insert_calls(cur)
    assert len(inserts) == 1
    params = inserts[0].args[1]
    assert params[2] == "INSERT"
    assert params[5] is None          # old_values NULL for INSERT
    assert len(params[8]) == 64       # entry_hash is 64-char hex


async def test_upsert_limits_audit_update_for_existing_period(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    """Period found in pre-read → UPDATE change log entry with old limit, chained hash."""
    cur.fetchone.side_effect = [_SITE_ROW, None]
    cur.fetchall.side_effect = [
        (("WEEKLY", Decimal("500000.00")),),                              # pre-read: WEEKLY exists
        (("WEEKLY", Decimal("600000.00"), Decimal("87600.00"), _NOW),),   # final budget read
    ]

    await upsert_limits(
        1,
        LimitsUpsertRequest(
            limits=[LimitUpsertItem(period_type="WEEKLY", budget_limit=Decimal("600000.00"))],
            updated_by="admin",
        ),
    )

    inserts = _cl_insert_calls(cur)
    assert len(inserts) == 1
    params = inserts[0].args[1]
    assert params[2] == "UPDATE"
    assert params[5] is not None      # old_values present
    assert len(params[8]) == 64       # entry_hash is 64-char hex


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
