import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.bonus_cache import BonusEventCache

COLLECTION = "bonus_event_types"


def _make_db(docs: list[dict]) -> MagicMock:
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=docs)
    collection = MagicMock()
    collection.find.return_value = cursor
    db = MagicMock()
    db.__getitem__.return_value = collection
    return db


class TestBonusEventCache:
    async def test_load_populates_set(self) -> None:
        db = _make_db([{"event_type": "bonus_spin"}, {"event_type": "reward_claimed"}])
        cache = BonusEventCache()
        await cache.load(db, COLLECTION)
        assert cache.is_bonus("bonus_spin")
        assert cache.is_bonus("reward_claimed")

    async def test_non_bonus_event_returns_false(self) -> None:
        db = _make_db([{"event_type": "bonus_spin"}])
        cache = BonusEventCache()
        await cache.load(db, COLLECTION)
        assert not cache.is_bonus("screen_viewed")

    async def test_empty_collection(self) -> None:
        cache = BonusEventCache()
        await cache.load(_make_db([]), COLLECTION)
        assert not cache.is_bonus("anything")

    async def test_docs_missing_event_type_skipped(self) -> None:
        db = _make_db([{"event_type": "bonus_spin"}, {"other_field": "junk"}])
        cache = BonusEventCache()
        await cache.load(db, COLLECTION)
        assert len(cache._types) == 1
        assert cache.is_bonus("bonus_spin")

    async def test_load_replaces_previous_set(self) -> None:
        cache = BonusEventCache()
        await cache.load(_make_db([{"event_type": "old_event"}]), COLLECTION)
        await cache.load(_make_db([{"event_type": "new_event"}]), COLLECTION)
        assert cache.is_bonus("new_event")
        assert not cache.is_bonus("old_event")

    async def test_stop_cancels_refresh_task(self) -> None:
        cache = BonusEventCache()
        await cache.start_refresh_loop(_make_db([]), COLLECTION, interval_hours=999)
        assert cache._refresh_task is not None
        assert not cache._refresh_task.done()
        await cache.stop()
        assert cache._refresh_task.done()

    async def test_stop_safe_without_task(self) -> None:
        cache = BonusEventCache()
        await cache.stop()  # must not raise

    async def test_refresh_loop_calls_load(self) -> None:
        db = _make_db([{"event_type": "bonus_spin"}])
        cache = BonusEventCache()
        await cache.load(db, COLLECTION)
        find_count_after_initial = db[COLLECTION].find.call_count

        with patch("app.bonus_cache.asyncio.sleep", AsyncMock(return_value=None)):
            await cache.start_refresh_loop(db, COLLECTION, interval_hours=1.0)
            for _ in range(5):
                await asyncio.sleep(0)
            await cache.stop()

        assert db[COLLECTION].find.call_count > find_count_after_initial

    async def test_refresh_loop_survives_load_error(self) -> None:
        cursor = MagicMock()
        cursor.to_list = AsyncMock(side_effect=Exception("db down"))
        collection = MagicMock()
        collection.find.return_value = cursor
        db = MagicMock()
        db.__getitem__.return_value = collection

        cache = BonusEventCache()
        cache._types = frozenset(["existing_event"])

        with patch("app.bonus_cache.asyncio.sleep", AsyncMock(return_value=None)):
            await cache.start_refresh_loop(db, COLLECTION, interval_hours=1.0)
            for _ in range(5):
                await asyncio.sleep(0)
            await cache.stop()

        assert cache.is_bonus("existing_event")
