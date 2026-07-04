"""Tests for shared.clients.mongo.get_users_batch."""

from unittest.mock import AsyncMock, MagicMock

from shared.clients.mongo import get_users_batch


def _mock_db(docs: list) -> MagicMock:
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=docs)
    collection = MagicMock()
    collection.find = MagicMock(return_value=cursor)
    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=collection)
    return db


async def test_get_users_batch_keys_by_user_id() -> None:
    db = _mock_db([
        {"user_id": "u1", "traits": {"email": "a@example.com"}},
        {"user_id": "u2", "traits": {"email": "b@example.com"}},
    ])

    result = await get_users_batch(db, "proj_1", ["u1", "u2", "u3"])

    assert set(result.keys()) == {"u1", "u2"}
    assert result["u1"]["traits"]["email"] == "a@example.com"


async def test_get_users_batch_empty_input_short_circuits() -> None:
    db = _mock_db([])

    result = await get_users_batch(db, "proj_1", [])

    assert result == {}
    db.__getitem__.assert_not_called()
