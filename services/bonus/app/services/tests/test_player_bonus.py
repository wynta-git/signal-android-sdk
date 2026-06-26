"""Tests for player_bonus_service — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import DatabaseError, PlayerBonusConsumedError, PlayerBonusNotFoundError
from app.models.player_bonus import PlayerBonusConsumeCreate
from app.services.player_bonus_service import (
    consume_bonus,
    get_player_bonus_summary,
    get_player_referral_code,
    get_player_transaction_detail,
    list_applicable_codes,
    list_player_transactions,
    revert_consumption,
)

_NOW = datetime(2026, 1, 15, 12, 0, 0)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def cur() -> AsyncMock:
    c = AsyncMock()
    c.lastrowid = 99
    return c


@pytest.fixture
def patch_conn(cur: AsyncMock):
    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cur)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor_ctx
    conn.commit = AsyncMock()

    @asynccontextmanager
    async def _fake_get_connection(pool=None):
        yield conn

    with patch("app.services.player_bonus_service.get_connection", _fake_get_connection):
        yield conn


# ---------------------------------------------------------------------------
# 1. list_applicable_codes
# ---------------------------------------------------------------------------

_CODE_ROW = (
    1, "WELCOME50", Decimal("500.00"),
    None, None,
    "Welcome Bonus", "Get 50% up to ₹500", None, None, "Hot", "Claim Now",
    True, 1, "DEPOSIT", Decimal("100.00"),
    Decimal("2.00"), 3, "ONCE",
)


async def test_applicable_codes_returns_list(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchall.return_value = [_CODE_ROW]

    result = await list_applicable_codes("user123", "cash")

    assert len(result) == 1
    r = result[0]
    assert r.promo_id == 1
    assert r.code == "WELCOME50"
    assert r.max_amount == Decimal("500.00")
    assert r.auto_apply is True
    assert r.display_order == 1
    assert r.wager_multiplier == Decimal("2.00")
    assert r.no_of_chunks == 3
    assert r.applicability_frequency == "ONCE"


async def test_applicable_codes_empty(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchall.return_value = []

    result = await list_applicable_codes("user123", "in_app_purchase")

    assert result == []


async def test_applicable_codes_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("db down")

    with pytest.raises(DatabaseError):
        await list_applicable_codes("user123", "cash")


# ---------------------------------------------------------------------------
# 2. consume_bonus
# ---------------------------------------------------------------------------

_CONSUME_PAYLOAD = PlayerBonusConsumeCreate(
    user_id="user123",
    consume_txn_id="txn-abc",
    wager_amount=Decimal("100.00"),
    bonus_amount=Decimal("50.00"),
    chip_type="cash",
    wager_tnx_id="wager-001",
)

# (id, consumed_ref, amount, consumed_amount, chip_type)
_CONSUMED_ROW = (99, "txn-abc", Decimal("50.00"), Decimal("50.00"), "cash")


async def test_consume_bonus_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    # fetchone: [1] duplicate check=None, [2] next chunk, [3] select consumed
    cur.fetchone.side_effect = [None, (10, 20, "user123"), _CONSUMED_ROW]

    result = await consume_bonus(_CONSUME_PAYLOAD)

    assert result.txn_id == 99
    assert result.consume_txn_id == "txn-abc"
    assert result.bonus_amount == Decimal("50.00")
    assert result.consumed_amount == Decimal("50.00")
    assert result.chip_type == "cash"
    patch_conn.commit.assert_awaited_once()


async def test_consume_bonus_duplicate_raises_conflict(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = (99,)  # consume_txn_id already exists

    with pytest.raises(PlayerBonusConsumedError):
        await consume_bonus(_CONSUME_PAYLOAD)

    patch_conn.commit.assert_not_awaited()


async def test_consume_bonus_no_chunk_raises_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [None, None]  # no duplicate, but no released chunk

    with pytest.raises(PlayerBonusNotFoundError):
        await consume_bonus(_CONSUME_PAYLOAD)

    patch_conn.commit.assert_not_awaited()


async def test_consume_bonus_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("connection lost")

    with pytest.raises(DatabaseError):
        await consume_bonus(_CONSUME_PAYLOAD)


async def test_consume_bonus_idempotency_key_used_in_query(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    cur.fetchone.side_effect = [None, (10, 20, "user123"), _CONSUMED_ROW]
    await consume_bonus(_CONSUME_PAYLOAD)

    # first execute must be the duplicate-check with the consume_txn_id
    first_call_params = cur.execute.await_args_list[0][0][1]
    assert "txn-abc" in first_call_params


# ---------------------------------------------------------------------------
# 3. revert_consumption
# ---------------------------------------------------------------------------

# (id, consumed_ref, bonus_grant_id, amount, chip_type)
_REVERT_ROW = (99, "txn-abc", 20, Decimal("50.00"), "cash")


async def test_revert_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = _REVERT_ROW

    result = await revert_consumption("txn-abc")

    assert result.txn_id == 99
    assert result.consume_txn_id == "txn-abc"
    assert result.amount == Decimal("50.00")
    assert result.chip_type == "cash"
    patch_conn.commit.assert_awaited_once()


async def test_revert_not_found(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(PlayerBonusNotFoundError):
        await revert_consumption("txn-nonexistent")

    patch_conn.commit.assert_not_awaited()


async def test_revert_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("timeout")

    with pytest.raises(DatabaseError):
        await revert_consumption("txn-abc")


# ---------------------------------------------------------------------------
# 4. get_player_bonus_summary
# ---------------------------------------------------------------------------


async def test_bonus_summary_single_chip(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchall.side_effect = [
        [("cash", Decimal("200.00"))],
        [("cash", Decimal("100.00"))],
        [("cash", Decimal("400.00"))],
    ]

    result = await get_player_bonus_summary(42)

    assert len(result) == 1
    r = result[0]
    assert r.chip_type == "cash"
    assert r.bonus_balance == Decimal("200.00")
    assert r.pending_bonus == Decimal("100.00")
    assert r.wagering_required == Decimal("400.00")


async def test_bonus_summary_multiple_chip_types(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchall.side_effect = [
        [("cash", Decimal("100.00")), ("in_app_purchase", Decimal("50.00"))],
        [("cash", Decimal("20.00"))],
        [("in_app_purchase", Decimal("80.00"))],
    ]

    result = await get_player_bonus_summary(42)

    chips = {r.chip_type: r for r in result}
    assert "cash" in chips
    assert "in_app_purchase" in chips
    assert chips["cash"].bonus_balance == Decimal("100.00")
    assert chips["in_app_purchase"].bonus_balance == Decimal("50.00")
    assert chips["in_app_purchase"].wagering_required == Decimal("80.00")


async def test_bonus_summary_no_bonuses_returns_empty(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchall.side_effect = [[], [], []]

    result = await get_player_bonus_summary(42)

    assert result == []


async def test_bonus_summary_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("db error")

    with pytest.raises(DatabaseError):
        await get_player_bonus_summary(42)


# ---------------------------------------------------------------------------
# 5. list_player_transactions
# ---------------------------------------------------------------------------

# (txn_id, bonus_code, amount, type, created_at)
_TXN_GRANT_ROW = (10, "WELCOME50", Decimal("500.00"), "grant", _NOW)
_TXN_RELEASE_ROW = (11, None, Decimal("250.00"), "released", _NOW)
_TXN_CONSUME_ROW = (12, None, Decimal("50.00"), "consumed", _NOW)


async def test_list_transactions_returns_all_types(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchall.return_value = [_TXN_GRANT_ROW, _TXN_RELEASE_ROW, _TXN_CONSUME_ROW]

    result = await list_player_transactions(42, "cash")

    assert len(result) == 3
    assert result[0].txn_id == 10
    assert result[0].bonus_code == "WELCOME50"
    assert result[0].type == "grant"
    assert result[1].type == "released"
    assert result[1].bonus_code is None
    assert result[2].type == "consumed"


async def test_list_transactions_empty(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchall.return_value = []

    result = await list_player_transactions(42, "cash")

    assert result == []


async def test_list_transactions_limit_offset_passed_to_query(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    cur.fetchall.return_value = []

    await list_player_transactions(42, "cash", limit=10, offset=20)

    call_params = cur.execute.await_args[0][1]
    assert call_params[-2] == 10   # limit is second-to-last
    assert call_params[-1] == 20   # offset is last


async def test_list_transactions_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("connection refused")

    with pytest.raises(DatabaseError):
        await list_player_transactions(42, "cash")


# ---------------------------------------------------------------------------
# 6. get_player_transaction_detail
# ---------------------------------------------------------------------------

# SELECT id, pam_user_id, bonus_code, wager_multiplier, no_of_chunks,
#        chunk_expiry_days, bonus_expiry_days, wager_chip_type, credit_chip_type,
#        grant_amount, release_amount, consume_amount, created_at
_GRANT_ROW = (
    5, 42, "WELCOME50",
    Decimal("2.00"), 2, 7, 30,
    "cash", "cash",
    Decimal("500.00"), Decimal("250.00"), Decimal("0.00"),
    _NOW,
)

# SELECT id, chunk_ref, chunk_amount, wager_multiplier, status,
#        required_wager_amount, wager_amount, created_at, updated_at
_CHUNK_PENDING = (1, "CHUNK-001", Decimal("250.00"), Decimal("2.00"), "PENDING",
                  Decimal("500.00"), Decimal("0.00"), _NOW, _NOW)
_CHUNK_RELEASE = (2, "CHUNK-002", Decimal("250.00"), Decimal("2.00"), "RELEASE",
                  Decimal("500.00"), Decimal("500.00"), _NOW, _NOW)

# SELECT id, requested_amount, amount, type, operator, forfeited_at
_FORFEIT_ROW = (10, Decimal("500.00"), Decimal("250.00"), "MANUAL", "admin_user", _NOW)

# SELECT id, chunk_id, amount, type, operator, expired_at
_EXPIRY_ROW = (20, 1, Decimal("250.00"), "CHUNK_EXPIRY", None, _NOW)


async def test_transaction_detail_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_GRANT_ROW, None]          # grant row, no forfeit
    cur.fetchall.side_effect = [[_CHUNK_PENDING, _CHUNK_RELEASE], []]  # chunks, no expiry

    result = await get_player_transaction_detail(42, "user123", 5)

    assert result.txn_id == 5
    assert result.user_id == "user123"
    assert result.bonus_code == "WELCOME50"
    assert result.grant_amount == Decimal("500.00")
    assert result.bonus_consumed == Decimal("0.00")
    assert len(result.chunks) == 2
    assert result.forfeit is None
    assert result.expiry_events == []


async def test_transaction_detail_chunk_fields(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_GRANT_ROW, None]
    cur.fetchall.side_effect = [[_CHUNK_PENDING], []]

    result = await get_player_transaction_detail(42, "user123", 5)

    chunk = result.chunks[0]
    assert chunk.id == 1
    assert chunk.chunk_ref == "CHUNK-001"
    assert chunk.chunk_amount == Decimal("250.00")
    assert chunk.status == "PENDING"
    assert chunk.wager_amount == Decimal("0.00")


async def test_transaction_detail_with_forfeit(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_GRANT_ROW, _FORFEIT_ROW]
    cur.fetchall.side_effect = [[_CHUNK_RELEASE], []]

    result = await get_player_transaction_detail(42, "user123", 5)

    assert result.forfeit is not None
    assert result.forfeit.id == 10
    assert result.forfeit.type == "MANUAL"
    assert result.forfeit.operator == "admin_user"
    assert result.status == "FORFEITED"


async def test_transaction_detail_with_expiry_events(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_GRANT_ROW, None]
    cur.fetchall.side_effect = [[_CHUNK_PENDING], [_EXPIRY_ROW]]

    result = await get_player_transaction_detail(42, "user123", 5)

    assert len(result.expiry_events) == 1
    ev = result.expiry_events[0]
    assert ev.id == 20
    assert ev.chunk_id == 1
    assert ev.type == "CHUNK_EXPIRY"
    assert ev.operator is None


async def test_transaction_detail_not_found_raises(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(PlayerBonusNotFoundError):
        await get_player_transaction_detail(42, "user123", 99)


async def test_transaction_detail_wrong_user_raises(cur: AsyncMock, patch_conn: MagicMock) -> None:
    wrong_user_row = (_GRANT_ROW[0], 99) + _GRANT_ROW[2:]  # 99 != 42
    cur.fetchone.return_value = wrong_user_row

    with pytest.raises(PlayerBonusNotFoundError):
        await get_player_transaction_detail(42, "user123", 5)


async def test_transaction_detail_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("db failure")

    with pytest.raises(DatabaseError):
        await get_player_transaction_detail(42, "user123", 5)


async def test_transaction_detail_status_partially_released(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    cur.fetchone.side_effect = [_GRANT_ROW, None]
    cur.fetchall.side_effect = [[_CHUNK_PENDING, _CHUNK_RELEASE], []]

    result = await get_player_transaction_detail(42, "user123", 5)

    assert result.status == "PARTIALLY_RELEASED"


async def test_transaction_detail_status_fully_released(
    cur: AsyncMock, patch_conn: MagicMock
) -> None:
    # no_of_chunks=2, both RELEASE
    cur.fetchone.side_effect = [_GRANT_ROW, None]
    cur.fetchall.side_effect = [[_CHUNK_RELEASE, _CHUNK_RELEASE], []]

    result = await get_player_transaction_detail(42, "user123", 5)

    assert result.status == "RELEASE"


async def test_transaction_detail_status_pending(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.side_effect = [_GRANT_ROW, None]
    cur.fetchall.side_effect = [[_CHUNK_PENDING], []]

    result = await get_player_transaction_detail(42, "user123", 5)

    assert result.status == "PENDING"


# ---------------------------------------------------------------------------
# 7. get_player_referral_code
# ---------------------------------------------------------------------------


async def test_referral_code_success(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = ("user123", "REF-XYZ999", _NOW)

    result = await get_player_referral_code("user123")

    assert result.user_id == "user123"
    assert result.referral_code == "REF-XYZ999"
    assert result.created_at == _NOW


async def test_referral_code_not_found_raises(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.fetchone.return_value = None

    with pytest.raises(PlayerBonusNotFoundError):
        await get_player_referral_code("user123")


async def test_referral_code_db_error(cur: AsyncMock, patch_conn: MagicMock) -> None:
    cur.execute.side_effect = RuntimeError("network error")

    with pytest.raises(DatabaseError):
        await get_player_referral_code("user123")
