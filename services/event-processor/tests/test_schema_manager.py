"""Tests for SchemaManager: sanitization, caching, locking, and DDL flows."""

import pytest
from unittest.mock import AsyncMock, MagicMock, call

from app.schema_manager import SchemaManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ch(columns: list[str] | None = None) -> AsyncMock:
    """ClickHouse client mock whose DESCRIBE TABLE returns the given column names."""
    client = AsyncMock()
    result = MagicMock()
    result.result_rows = [(c,) for c in (columns or [])]
    client.query.return_value = result
    return client


def _redis(
    *,
    col_map: dict[str, str] | None = None,
    lock_won: bool = True,
    lock_exists: bool = False,
) -> AsyncMock:
    """Redis async client mock.

    col_map  — pre-existing {raw_key: col_name} entries in the hash.
    lock_won — True if SET NX should succeed (this instance wins the lock).
    lock_exists — True if EXISTS should report the lock is still held (loser waits once).
    """
    stored = dict(col_map or {})
    redis = AsyncMock()

    # decode_responses=True (matches shared/clients/redis.py) — all values are strings.
    redis.hgetall.return_value = dict(stored)

    async def _hget(map_key: str, field: str):
        return stored.get(field)
    redis.hget.side_effect = _hget

    async def _hsetnx(map_key: str, field: str, value: str):
        if field not in stored:
            stored[field] = value
            return 1
        return 0
    redis.hsetnx.side_effect = _hsetnx

    async def _hmget(map_key: str, *fields: str):
        return [stored.get(f) for f in fields]
    redis.hmget.side_effect = _hmget

    redis.set.return_value = lock_won

    # exists: return 1 first call (lock still held), then 0 (lock released).
    redis.exists.side_effect = [1, 0] if lock_exists else [0]

    pipe = AsyncMock()
    pipe.hsetnx = AsyncMock()
    pipe.execute = AsyncMock(return_value=[])
    redis.pipeline.return_value = pipe

    return redis


def _mgr(*, ch=None, redis=None, col_map=None, lock_won=True, lock_exists=False):
    return SchemaManager(
        redis=redis or _redis(col_map=col_map, lock_won=lock_won, lock_exists=lock_exists),
        ch_client=ch or _ch(),
    )


# ---------------------------------------------------------------------------
# sanitize_key
# ---------------------------------------------------------------------------

class TestSanitizeKey:
    def test_lowercase_passthrough(self):
        assert _mgr().sanitize_key("foo_bar") == "foo_bar"

    def test_special_chars_replaced(self):
        assert _mgr().sanitize_key("foo-bar.baz") == "foo_bar_baz"

    def test_leading_digit_prefixed(self):
        assert _mgr().sanitize_key("123abc") == "prop_123abc"

    def test_leading_underscores_stripped(self):
        assert _mgr().sanitize_key("___foo") == "foo"

    def test_all_underscores_becomes_prop(self):
        assert _mgr().sanitize_key("___") == "prop"

    def test_truncated_to_64_chars(self):
        result = _mgr().sanitize_key("a" * 100)
        assert len(result) == 64

    def test_reserved_word_gets_suffix(self):
        assert _mgr().sanitize_key("select") == "select_col"

    def test_unicode_replaced(self):
        assert _mgr().sanitize_key("café_price") == "caf_price"


# ---------------------------------------------------------------------------
# table_name
# ---------------------------------------------------------------------------

class TestTableName:
    def test_simple_project_id(self):
        assert _mgr().table_name("acme") == "pam.events_acme"

    def test_special_chars_sanitized(self):
        assert _mgr().table_name("acme-corp") == "pam.events_acme_corp"

    def test_uppercase_lowercased(self):
        assert _mgr().table_name("ACME") == "pam.events_acme"


# ---------------------------------------------------------------------------
# bootstrap_table
# ---------------------------------------------------------------------------

class TestBootstrapTable:
    @pytest.mark.asyncio
    async def test_creates_table_on_first_call(self):
        ch = _ch(columns=["event_id", "event_name"])
        mgr = _mgr(ch=ch)

        await mgr.bootstrap_table("acme")

        ch.command.assert_called_once()
        ddl = ch.command.call_args[0][0]
        assert "CREATE TABLE IF NOT EXISTS" in ddl
        assert "events_acme" in ddl

    @pytest.mark.asyncio
    async def test_warms_column_cache(self):
        ch = _ch(columns=["event_id", "user_id"])
        mgr = _mgr(ch=ch)

        await mgr.bootstrap_table("acme")

        assert mgr._col_cache["acme"] == {"event_id", "user_id"}

    @pytest.mark.asyncio
    async def test_noop_when_already_cached(self):
        ch = _ch()
        mgr = _mgr(ch=ch)
        mgr._col_cache["acme"] = {"event_id"}

        await mgr.bootstrap_table("acme")

        ch.command.assert_not_called()
        ch.query.assert_not_called()


# ---------------------------------------------------------------------------
# get_known_columns
# ---------------------------------------------------------------------------

class TestGetKnownColumns:
    @pytest.mark.asyncio
    async def test_fetches_from_clickhouse_on_miss(self):
        ch = _ch(columns=["event_id", "event_name"])
        mgr = _mgr(ch=ch)

        cols = await mgr.get_known_columns("acme")

        assert cols == {"event_id", "event_name"}
        ch.query.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_from_cache_on_second_call(self):
        ch = _ch(columns=["event_id"])
        mgr = _mgr(ch=ch)

        await mgr.get_known_columns("acme")
        await mgr.get_known_columns("acme")

        assert ch.query.call_count == 1

    @pytest.mark.asyncio
    async def test_update_cache_adds_column(self):
        ch = _ch(columns=["event_id"])
        mgr = _mgr(ch=ch)
        await mgr.get_known_columns("acme")

        mgr._update_cache("acme", "price")

        assert "price" in mgr._col_cache["acme"]
        assert ch.query.call_count == 1  # no extra fetch

    @pytest.mark.asyncio
    async def test_invalidate_cache_forces_refetch(self):
        ch = _ch(columns=["event_id"])
        mgr = _mgr(ch=ch)
        await mgr.get_known_columns("acme")

        mgr.invalidate_cache("acme")
        await mgr.get_known_columns("acme")

        assert ch.query.call_count == 2


# ---------------------------------------------------------------------------
# col_lock
# ---------------------------------------------------------------------------

class TestColLock:
    @pytest.mark.asyncio
    async def test_winner_yields_true(self):
        mgr = _mgr(lock_won=True)
        async with mgr.col_lock("acme", "price") as won:
            assert won is True

    @pytest.mark.asyncio
    async def test_loser_yields_false(self):
        mgr = _mgr(lock_won=False)
        async with mgr.col_lock("acme", "price") as won:
            assert won is False

    @pytest.mark.asyncio
    async def test_winner_releases_lock_on_exit(self):
        redis = _redis(lock_won=True)
        mgr = _mgr(redis=redis)

        async with mgr.col_lock("acme", "price"):
            pass

        redis.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_loser_does_not_release_lock(self):
        redis = _redis(lock_won=False)
        mgr = _mgr(redis=redis)

        async with mgr.col_lock("acme", "price"):
            pass

        redis.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_winner_releases_lock_even_on_exception(self):
        redis = _redis(lock_won=True)
        mgr = _mgr(redis=redis)

        with pytest.raises(RuntimeError):
            async with mgr.col_lock("acme", "price"):
                raise RuntimeError("boom")

        redis.delete.assert_called_once()


# ---------------------------------------------------------------------------
# wait_for_lock_release
# ---------------------------------------------------------------------------

class TestWaitForLockRelease:
    @pytest.mark.asyncio
    async def test_returns_immediately_when_lock_gone(self):
        redis = _redis(lock_exists=False)
        mgr = _mgr(redis=redis)

        await mgr.wait_for_lock_release("acme", "price")

        redis.exists.assert_called_once()

    @pytest.mark.asyncio
    async def test_polls_until_lock_released(self):
        redis = _redis(lock_exists=True)  # exists=1 first, then 0
        mgr = _mgr(redis=redis)

        await mgr.wait_for_lock_release("acme", "price")

        assert redis.exists.call_count == 2


# ---------------------------------------------------------------------------
# ensure_columns
# ---------------------------------------------------------------------------

class TestEnsureColumns:
    @pytest.mark.asyncio
    async def test_no_ddl_when_all_columns_known(self):
        ch = _ch(columns=["price"])
        mgr = _mgr(ch=ch, col_map={"price": "price"})

        col_map = await mgr.ensure_columns("acme", {"price"})

        assert col_map == {"price": "price"}
        ch.command.assert_not_called()

    @pytest.mark.asyncio
    async def test_winner_issues_alter_table(self):
        ch = _ch(columns=[])  # no columns yet
        mgr = _mgr(ch=ch, col_map={"price": "price"}, lock_won=True)

        await mgr.ensure_columns("acme", {"price"})

        ch.command.assert_called_once()
        ddl = ch.command.call_args[0][0]
        assert "ADD COLUMN IF NOT EXISTS price" in ddl

    @pytest.mark.asyncio
    async def test_winner_updates_cache_after_alter(self):
        ch = _ch(columns=[])
        mgr = _mgr(ch=ch, col_map={"price": "price"}, lock_won=True)

        await mgr.ensure_columns("acme", {"price"})

        assert "price" in mgr._col_cache.get("acme", set())

    @pytest.mark.asyncio
    async def test_loser_does_not_issue_alter_table(self):
        # After waiting, DESCRIBE TABLE returns the column (winner committed it).
        ch = _ch(columns=["price"])
        mgr = _mgr(ch=ch, col_map={"price": "price"}, lock_won=False, lock_exists=False)

        await mgr.ensure_columns("acme", {"price"})

        ch.command.assert_not_called()

    @pytest.mark.asyncio
    async def test_loser_resyncs_cache_after_waiting(self):
        # First DESCRIBE TABLE (initial load) returns nothing; after waiting the
        # winner has added the column so the second fetch returns it.
        ch = AsyncMock()
        first = MagicMock()
        first.result_rows = []
        second = MagicMock()
        second.result_rows = [("price",)]
        ch.query.side_effect = [first, second]

        mgr = _mgr(ch=ch, col_map={"price": "price"}, lock_won=False, lock_exists=False)

        await mgr.ensure_columns("acme", {"price"})

        assert ch.query.call_count == 2
        assert "price" in mgr._col_cache.get("acme", set())

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_keys(self):
        mgr = _mgr()
        result = await mgr.ensure_columns("acme", set())
        assert result == {}
