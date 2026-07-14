"""Tests for run_chunk_expiry_job — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.bonus_event_processor.chunk_expiry_job import (
    _EXPIRE_CHUNK_SQL,
    _EXPIRED_CHUNKS_SQL,
    _INSERT_CHUNK_EXPIRY_SQL,
    _UPDATE_GRANT_EXPIRY_SQL,
    run_chunk_expiry_job,
)


@pytest.fixture
def cur() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def conn(cur: AsyncMock) -> MagicMock:
    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cur)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor_ctx
    conn.commit = AsyncMock()
    return conn


@pytest.fixture(autouse=True)
def patched_get_connection(conn: MagicMock, monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    @asynccontextmanager
    async def _fake_get_connection(name: str):
        yield conn

    monkeypatch.setattr(
        "app.bonus_event_processor.chunk_expiry_job.get_connection", _fake_get_connection
    )
    return conn


async def test_no_expired_chunks_is_a_noop(conn: MagicMock, cur: AsyncMock) -> None:
    cur.fetchall.return_value = ()

    result = await run_chunk_expiry_job(batch_size=500)

    assert result == 0
    cur.execute.assert_awaited_once_with(_EXPIRED_CHUNKS_SQL, (500,))
    conn.commit.assert_not_awaited()


async def test_expires_chunk_with_unreleased_balance(conn: MagicMock, cur: AsyncMock) -> None:
    # chunk 101: 100.00 charged, only 30.00 ever released -> 70.00 still owed on expiry
    cur.fetchall.return_value = (
        (101, Decimal("100.00"), Decimal("30.00"), 55, 217, 44, "CODE1", "CASH", 2, "CH001", Decimal("30.00"), None, "CASH"),
    )

    result = await run_chunk_expiry_job(batch_size=200)

    assert result == 1
    execute_calls = cur.execute.call_args_list
    assert execute_calls[0].args == (_EXPIRED_CHUNKS_SQL, (200,))

    expire_call = next(c for c in execute_calls if c.args[0] == _EXPIRE_CHUNK_SQL)
    assert expire_call.args[1] == (Decimal("70.00"), 101)

    insert_call = next(c for c in execute_calls if c.args[0] == _INSERT_CHUNK_EXPIRY_SQL)
    assert insert_call.args[1] == (101, 55, Decimal("70.00"))

    grant_call = next(c for c in execute_calls if c.args[0] == _UPDATE_GRANT_EXPIRY_SQL)
    assert grant_call.args[1] == (Decimal("70.00"), 55)

    conn.commit.assert_awaited_once()


async def test_chunk_fully_released_before_expiry_skips_audit_rows(
    conn: MagicMock, cur: AsyncMock,
) -> None:
    # chunk 102: fully released (100.00 of 100.00) -- nothing left to expire
    cur.fetchall.return_value = (
        (102, Decimal("100.00"), Decimal("100.00"), 56, 217, 44, "CODE1", "CASH", 1, "CH001", Decimal("100.00"), None, "CASH"),
    )

    result = await run_chunk_expiry_job()

    # still counted as "processed" even though no ledger rows were written
    assert result == 1
    execute_calls = cur.execute.call_args_list

    expire_call = next(c for c in execute_calls if c.args[0] == _EXPIRE_CHUNK_SQL)
    assert expire_call.args[1] == (Decimal("0.00"), 102)

    assert not any(c.args[0] == _INSERT_CHUNK_EXPIRY_SQL for c in execute_calls)
    assert not any(c.args[0] == _UPDATE_GRANT_EXPIRY_SQL for c in execute_calls)

    conn.commit.assert_awaited_once()


async def test_over_released_chunk_clamps_expiry_amount_to_zero(
    conn: MagicMock, cur: AsyncMock,
) -> None:
    # release_amount > chunk_amount should never happen, but must never go negative
    cur.fetchall.return_value = (
        (103, Decimal("50.00"), Decimal("60.00"), 57, 217, 44, "CODE1", "CASH", 1, "CH001", Decimal("60.00"), None, "CASH"),
    )

    await run_chunk_expiry_job()

    expire_call = next(c for c in cur.execute.call_args_list if c.args[0] == _EXPIRE_CHUNK_SQL)
    assert expire_call.args[1] == (Decimal("0.00"), 103)


async def test_multiple_chunks_mixed_outcomes(conn: MagicMock, cur: AsyncMock) -> None:
    cur.fetchall.return_value = (
        (101, Decimal("100.00"), Decimal("30.00"), 55, 217, 44, "CODE1", "CASH", 2, "CH001", Decimal("30.00"), None, "CASH"),   # 70.00 to expire
        (102, Decimal("100.00"), Decimal("100.00"), 56, 217, 44, "CODE1", "CASH", 1, "CH001", Decimal("100.00"), None, "CASH"),  # nothing left
    )

    result = await run_chunk_expiry_job()

    assert result == 2
    insert_calls = [c for c in cur.execute.call_args_list if c.args[0] == _INSERT_CHUNK_EXPIRY_SQL]
    assert len(insert_calls) == 1
    assert insert_calls[0].args[1] == (101, 55, Decimal("70.00"))
