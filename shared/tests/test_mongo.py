"""Tests for shared.clients.mongo.get_users_batch."""

from unittest.mock import AsyncMock, MagicMock

from shared.clients.mongo import (
    get_project_email_provider_name,
    get_project_mailgun_credential,
    get_users_batch,
)


def _mock_db(docs: list) -> MagicMock:
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=docs)
    collection = MagicMock()
    collection.find = MagicMock(return_value=cursor)
    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=collection)
    return db


def _mock_db_find_one(by_collection: dict) -> MagicMock:
    """db["<collection>"].find_one(...) returns by_collection[<collection>]."""

    def _collection(name: str) -> MagicMock:
        collection = MagicMock()
        collection.find_one = AsyncMock(return_value=by_collection.get(name))
        return collection

    db = MagicMock()
    db.__getitem__ = MagicMock(side_effect=_collection)
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


# ---------------------------------------------------------------------------
# Email provider registry — brand->project fallback, defaults to sendgrid
# ---------------------------------------------------------------------------


async def test_email_provider_name_brand_level_wins() -> None:
    db = _mock_db_find_one({"brand_settings": {"email_provider": "mailgun"}})
    result = await get_project_email_provider_name(db, "proj_1", brand_id="brand_217")
    assert result == "mailgun"


async def test_email_provider_name_falls_back_to_project_level() -> None:
    db = _mock_db_find_one({
        "brand_settings": None,
        "projects": {"settings": {"email_provider": "mailgun"}},
    })
    result = await get_project_email_provider_name(db, "proj_1", brand_id="brand_217")
    assert result == "mailgun"


async def test_email_provider_name_defaults_to_sendgrid_when_unset() -> None:
    """Every brand/project configured before this field existed must keep
    resolving to sendgrid with zero data migration."""
    db = _mock_db_find_one({"brand_settings": None, "projects": {"settings": {}}})
    result = await get_project_email_provider_name(db, "proj_1", brand_id="brand_217")
    assert result == "sendgrid"


async def test_get_project_mailgun_credential_brand_level() -> None:
    db = _mock_db_find_one({
        "brand_settings": {
            "mailgun_api_key": "key-test",
            "mailgun_domain": "mg.acme.com",
            "mailgun_from_email": "hello@acme.com",
            "mailgun_from_name": "Acme",
        }
    })
    result = await get_project_mailgun_credential(db, "proj_1", brand_id="brand_217")
    assert result == {
        "api_key": "key-test",
        "domain": "mg.acme.com",
        "from_email": "hello@acme.com",
        "from_name": "Acme",
    }


async def test_get_project_mailgun_credential_none_when_unconfigured() -> None:
    db = _mock_db_find_one({"brand_settings": None, "projects": None})
    result = await get_project_mailgun_credential(db, "proj_1", brand_id="brand_217")
    assert result is None
