"""Tests for shared.services.segments — the read-side of segment membership
moved out of segmentation-engine so other services (e.g. auth-service) can
read the same Redis structures without duplicating the key format."""

from unittest.mock import AsyncMock, MagicMock

from shared.services.segments import (
    get_membership,
    get_segment_member_ids,
    get_user_segment_memberships,
    list_segment_members,
    list_segment_summaries,
    segment_joined_key,
    segment_members_key,
)


def test_key_formats() -> None:
    assert segment_members_key("proj_1", "seg_1") == "pam:seg:proj_1:seg_1:members"
    assert segment_joined_key("proj_1", "seg_1") == "pam:seg:proj_1:seg_1:joined"


def _mock_redis() -> MagicMock:
    redis = MagicMock()
    redis.smembers = AsyncMock()
    redis.hmget = AsyncMock()
    # redis.asyncio's pipeline() is a *sync* call returning an async context
    # manager — must stay a plain MagicMock, not AsyncMock, or `async with
    # redis.pipeline(...)` tries to await a coroutine instead of entering it.
    redis.pipeline = MagicMock()
    return redis


async def test_list_segment_members_paginates_and_joins_timestamps() -> None:
    redis = _mock_redis()
    redis.smembers.return_value = {"u3", "u1", "u2"}
    redis.hmget.return_value = ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"]

    rows = await list_segment_members(redis, "proj_1", "seg_1", limit=2, cursor=None)

    redis.smembers.assert_awaited_once_with("pam:seg:proj_1:seg_1:members")
    assert rows == [
        {"user_id": "u1", "joined_at": "2026-01-01T00:00:00Z"},
        {"user_id": "u2", "joined_at": "2026-01-02T00:00:00Z"},
    ]


async def test_list_segment_members_cursor_excludes_seen_ids() -> None:
    redis = _mock_redis()
    redis.smembers.return_value = {"u1", "u2", "u3"}
    redis.hmget.return_value = ["2026-01-03T00:00:00Z"]

    rows = await list_segment_members(redis, "proj_1", "seg_1", limit=10, cursor="u2")

    assert rows == [{"user_id": "u3", "joined_at": "2026-01-03T00:00:00Z"}]


async def test_list_segment_members_empty_returns_empty_list() -> None:
    redis = _mock_redis()
    redis.smembers.return_value = set()

    rows = await list_segment_members(redis, "proj_1", "seg_1", limit=10, cursor=None)

    assert rows == []
    redis.hmget.assert_not_called()


def _mock_pipeline(results: list) -> MagicMock:
    pipe = MagicMock()
    pipe.execute = AsyncMock(return_value=results)
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=pipe)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


async def test_get_membership_found() -> None:
    redis = _mock_redis()
    redis.pipeline.return_value = _mock_pipeline([True, "2026-01-01T00:00:00Z"])

    result = await get_membership(redis, "proj_1", "seg_1", "u1")

    assert result == {"segment_id": "seg_1", "user_id": "u1", "joined_at": "2026-01-01T00:00:00Z"}


async def test_get_membership_not_found() -> None:
    redis = _mock_redis()
    redis.pipeline.return_value = _mock_pipeline([False, None])

    result = await get_membership(redis, "proj_1", "seg_1", "ghost")

    assert result is None


async def test_get_segment_member_ids() -> None:
    redis = _mock_redis()
    redis.smembers.return_value = {"u1", "u2"}

    ids = await get_segment_member_ids(redis, "proj_1", "seg_1")

    assert ids == {"u1", "u2"}
    redis.smembers.assert_awaited_once_with("pam:seg:proj_1:seg_1:members")


def _mock_mongo_find(docs: list) -> MagicMock:
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=docs)
    collection = MagicMock()
    collection.find = MagicMock(return_value=cursor)
    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=collection)
    return db


async def test_list_segment_summaries() -> None:
    db = _mock_mongo_find([{"segment_id": "seg_1", "name": "VIP"}, {"segment_id": "seg_2", "name": "New"}])

    result = await list_segment_summaries(db, "proj_1")

    assert result == [{"segment_id": "seg_1", "name": "VIP"}, {"segment_id": "seg_2", "name": "New"}]


async def test_get_user_segment_memberships_filters_to_actual_members() -> None:
    db = _mock_mongo_find([{"segment_id": "seg_1", "name": "VIP"}, {"segment_id": "seg_2", "name": "New"}])
    redis = _mock_redis()
    redis.pipeline.return_value = _mock_pipeline([True, False])

    result = await get_user_segment_memberships(redis, db, "proj_1", "u1")

    assert result == [{"segment_id": "seg_1", "name": "VIP"}]


async def test_get_user_segment_memberships_no_segments_short_circuits() -> None:
    db = _mock_mongo_find([])
    redis = _mock_redis()

    result = await get_user_segment_memberships(redis, db, "proj_1", "u1")

    assert result == []
    redis.pipeline.assert_not_called()
