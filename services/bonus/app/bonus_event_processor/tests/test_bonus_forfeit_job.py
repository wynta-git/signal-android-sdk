"""Tests for run_bonus_forfeit_job — DB layer is mocked, no real MySQL needed."""

from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.bonus_event_processor.bonus_forfeit_job import (
    _EXPIRED_GRANTS_SQL,
    _FORFEIT_CHUNK_SQL,
    _INSERT_FORFEIT_SQL,
    _RELEASED_UNCONSUMED_CHUNKS_SQL,
    _UPDATE_GRANT_FORFEITED_SQL,
    run_bonus_forfeit_job,
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
        "app.bonus_event_processor.bonus_forfeit_job.get_connection", _fake_get_connection
    )
    return conn


async def test_no_expired_grants_is_a_noop(conn: MagicMock, cur: AsyncMock) -> None:
    cur.fetchall.return_value = ()

    result = await run_bonus_forfeit_job(batch_size=500)

    assert result == 0
    cur.execute.assert_awaited_once_with(_EXPIRED_GRANTS_SQL, (500,))
    conn.commit.assert_not_awaited()


async def test_forfeits_grant_and_its_released_unconsumed_chunk(
    conn: MagicMock, cur: AsyncMock,
) -> None:
    # grant 10: released 100.00, consumed 40.00 -> 60.00 to forfeit; its one
    # released-but-unconsumed chunk still holds the full 60.00
    cur.fetchall.side_effect = [
        ((10, Decimal("100.00"), Decimal("40.00"), 217, 44, "CODE1", "CASH", 1, None, "CASH"),),  # expired grants
        ((201, Decimal("60.00"), Decimal("0.00"), "CH001", Decimal("60.00")),),   # released/unconsumed chunks for grant 10
    ]

    result = await run_bonus_forfeit_job(batch_size=300)

    assert result == 1
    execute_calls = cur.execute.call_args_list
    assert execute_calls[0].args == (_EXPIRED_GRANTS_SQL, (300,))

    chunks_call = next(c for c in execute_calls if c.args[0] == _RELEASED_UNCONSUMED_CHUNKS_SQL)
    assert chunks_call.args[1] == (10,)

    insert_call = next(c for c in execute_calls if c.args[0] == _INSERT_FORFEIT_SQL)
    assert insert_call.args[1] == (10, Decimal("60.00"), Decimal("60.00"))

    grant_call = next(c for c in execute_calls if c.args[0] == _UPDATE_GRANT_FORFEITED_SQL)
    assert grant_call.args[1] == (Decimal("60.00"), 10)

    chunk_call = next(c for c in execute_calls if c.args[0] == _FORFEIT_CHUNK_SQL)
    assert chunk_call.args[1] == (Decimal("60.00"), 201)

    conn.commit.assert_awaited_once()


async def test_chunk_with_no_available_balance_is_skipped(
    conn: MagicMock, cur: AsyncMock,
) -> None:
    # the chunk's own consume_amount already caught up to its release_amount --
    # nothing left on it even though the grant overall is still owed 60.00
    cur.fetchall.side_effect = [
        ((10, Decimal("100.00"), Decimal("40.00"), 217, 44, "CODE1", "CASH", 1, None, "CASH"),),
        ((201, Decimal("30.00"), Decimal("30.00"), "CH001", Decimal("30.00")),),  # available = 0
    ]

    await run_bonus_forfeit_job()

    execute_calls = cur.execute.call_args_list
    assert not any(c.args[0] == _FORFEIT_CHUNK_SQL for c in execute_calls)
    # the grant-level forfeit record is still written regardless
    assert any(c.args[0] == _INSERT_FORFEIT_SQL for c in execute_calls)


async def test_multiple_grants_each_forfeited_independently(
    conn: MagicMock, cur: AsyncMock,
) -> None:
    cur.fetchall.side_effect = [
        (
            (10, Decimal("100.00"), Decimal("40.00"), 217, 44, "CODE1", "CASH", 1, None, "CASH"),
            (11, Decimal("50.00"), Decimal("0.00"), 217, 45, "CODE2", "CASH", 1, None, "CASH"),
        ),
        ((201, Decimal("60.00"), Decimal("0.00"), "CH001", Decimal("60.00")),),  # chunks for grant 10
        ((202, Decimal("50.00"), Decimal("0.00"), "CH001", Decimal("50.00")),),  # chunks for grant 11
    ]

    result = await run_bonus_forfeit_job()

    assert result == 2
    insert_calls = [c for c in cur.execute.call_args_list if c.args[0] == _INSERT_FORFEIT_SQL]
    assert insert_calls[0].args[1] == (10, Decimal("60.00"), Decimal("60.00"))
    assert insert_calls[1].args[1] == (11, Decimal("50.00"), Decimal("50.00"))

    conn.commit.assert_awaited_once()
