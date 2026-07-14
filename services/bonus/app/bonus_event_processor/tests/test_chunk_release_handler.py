"""Tests for release_all_chunks — DB layer is mocked, no real MySQL needed.

Regression coverage for the bug where release_all_chunks() built a 6-value
tuple for a 7-placeholder INSERT (missing bonus_release_id), crashing every
wager_multiplier=0 grant before the chunk could actually flip to RELEASE.
"""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.bonus_event_processor.chunk_release_handler import (
    _INSERT_BONUS_RELEASE_SQL,
    _INSERT_CHUNK_RELEASE_SQL,
    _RELEASE_ALL_PENDING_CHUNKS_SQL,
    _UPDATE_GRANT_RELEASE_SQL,
    release_all_chunks,
)

_PENDING_CHUNK_ROWS = (
    (101, Decimal("50.00"), "CH001", Decimal("100.00")),
    (102, Decimal("25.00"), "CH002", Decimal("100.00")),
)


@pytest.fixture
def cur() -> AsyncMock:
    cur = AsyncMock()
    cur.lastrowid = 777
    return cur


@pytest.fixture
def conn(cur: AsyncMock) -> MagicMock:
    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cur)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor_ctx
    conn.commit = AsyncMock()
    return conn


async def test_release_all_chunks_inserts_header_row_and_releases(
    conn: MagicMock, cur: AsyncMock,
) -> None:
    cur.fetchall.return_value = _PENDING_CHUNK_ROWS

    await release_all_chunks(conn, bonus_grant_id=5, site_id=1, event_id="evt-1", pam_user_id=9001)

    execute_calls = cur.execute.call_args_list
    header_call = next(c for c in execute_calls if c.args[0] == _INSERT_BONUS_RELEASE_SQL)
    assert header_call.args[1] == (1, "9001", "evt-1", "SYSTEM", None, None, None, None, 0.00, 75.0)

    executemany_call = cur.executemany.call_args_list[0]
    assert executemany_call.args[0] == _INSERT_CHUNK_RELEASE_SQL
    rows = executemany_call.args[1]
    assert rows == [
        (101, 1, "evt-1", "SYSTEM", 0.00, Decimal("50.00"), 777),
        (102, 1, "evt-1", "SYSTEM", 0.00, Decimal("25.00"), 777),
    ]
    # every row must carry the bonus_release_id returned by lastrowid
    assert all(len(r) == 7 and r[6] == cur.lastrowid for r in rows)

    release_call = next(c for c in execute_calls if c.args[0] == _RELEASE_ALL_PENDING_CHUNKS_SQL)
    assert release_call.args[1] == (5,)

    grant_call = next(c for c in execute_calls if c.args[0] == _UPDATE_GRANT_RELEASE_SQL)
    assert grant_call.args[1] == (75.0, 5)

    conn.commit.assert_awaited_once()


async def test_release_all_chunks_emits_bonus_released_webhook(
    conn: MagicMock, cur: AsyncMock, monkeypatch: pytest.MonkeyPatch,
) -> None:
    cur.fetchall.return_value = _PENDING_CHUNK_ROWS

    sent = []

    async def fake_send(redis, site_id, pam_user_id, event_type, payload):
        sent.append((site_id, pam_user_id, event_type, payload))

    monkeypatch.setattr(
        "app.bonus_event_processor.chunk_release_handler.send_bonus_webhook", fake_send,
    )
    monkeypatch.setattr(
        "app.bonus_event_processor.chunk_release_handler.get_resulting_balance",
        AsyncMock(return_value={"pending_bonus": "0.00", "bonus_balance": "75.00", "wagering_required": "0.00"}),
    )

    await release_all_chunks(
        conn, bonus_grant_id=5, site_id=1, event_id="evt-1", pam_user_id=9001,
        bonus_code="WELCOME100", chip_type="BONUS", wager_chip_type="CASH",
        external_user_id="P123", redis=AsyncMock(),
    )

    assert len(sent) == 1
    site_id, pam_user_id, event_type, payload = sent[0]
    assert site_id == 1
    assert pam_user_id == 9001
    assert event_type == "BONUS_RELEASED"
    assert payload["player_id"] == "P123"
    assert payload["bonus_code"] == "WELCOME100"
    assert payload["txn_id"] == 5
    assert len(payload["chunks"]) == 2
    assert payload["chunks"][0]["chunk_ref"] == "CH001"
    assert payload["chunks"][0]["sequence"] == 1
    assert payload["amount"] == "75.00"


async def test_release_all_chunks_nothing_pending_is_a_noop(
    conn: MagicMock, cur: AsyncMock,
) -> None:
    cur.fetchall.return_value = ()

    await release_all_chunks(conn, bonus_grant_id=5, site_id=1, event_id="evt-1", pam_user_id=9001)

    cur.execute.assert_awaited_once()  # only the pending-chunks SELECT
    cur.executemany.assert_not_awaited()
    conn.commit.assert_not_awaited()
