"""Tests for shared.services.user.resolve_pam_id_from_brand."""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import aiomysql
import pytest

from shared.services.user import get_or_create_pam_user, resolve_pam_id_from_brand


def _fake_conn(cur: AsyncMock) -> MagicMock:
    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cur)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = cursor_ctx
    conn.commit = AsyncMock()
    return conn


@pytest.mark.parametrize("brand_id", [None, "", "not-a-number"])
async def test_resolve_pam_id_from_brand_invalid_returns_none(brand_id: str | None) -> None:
    with patch("shared.services.user.get_pam_user_id", new=AsyncMock()) as mocked:
        result = await resolve_pam_id_from_brand(AsyncMock(), brand_id, "u1")

    assert result is None
    mocked.assert_not_awaited()


async def test_resolve_pam_id_from_brand_valid_numeric_brand_id() -> None:
    redis = AsyncMock()
    with patch("shared.services.user.get_pam_user_id", new=AsyncMock(return_value=42)) as mocked:
        result = await resolve_pam_id_from_brand(redis, "217", "u1")

    assert result == 42
    mocked.assert_awaited_once_with(redis, 217, "u1")


async def test_resolve_pam_id_from_brand_not_found() -> None:
    with patch("shared.services.user.get_pam_user_id", new=AsyncMock(return_value=None)):
        result = await resolve_pam_id_from_brand(AsyncMock(), "217", "u1")

    assert result is None


async def test_get_or_create_pam_user_inserts_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    cur = AsyncMock()
    cur.fetchone.return_value = None
    cur.lastrowid = 42
    conn = _fake_conn(cur)

    @asynccontextmanager
    async def fake_get_connection(name: str):
        yield conn

    monkeypatch.setattr("shared.services.user.get_connection", fake_get_connection)
    redis = AsyncMock()
    redis.get.return_value = None

    pam_id = await get_or_create_pam_user(redis, site_id=1, user_id="u1")

    assert pam_id == 42
    conn.commit.assert_awaited_once()


async def test_get_or_create_pam_user_resolves_concurrent_insert_race(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two concurrent first-events for a brand-new user both see no row, both try to
    INSERT — the loser must recover by re-reading the winner's row, not raise/crash.
    """
    cur = AsyncMock()
    # 1st SELECT: not found. INSERT: duplicate-key (the other call already won).
    # 2nd SELECT: the winner's row is now visible.
    cur.fetchone.side_effect = [None, (99,)]
    cur.execute.side_effect = [None, aiomysql.IntegrityError(1062, "Duplicate entry"), None]
    conn = _fake_conn(cur)

    @asynccontextmanager
    async def fake_get_connection(name: str):
        yield conn

    monkeypatch.setattr("shared.services.user.get_connection", fake_get_connection)
    redis = AsyncMock()
    redis.get.return_value = None

    pam_id = await get_or_create_pam_user(redis, site_id=1, user_id="u1")

    assert pam_id == 99
    conn.commit.assert_not_awaited()


async def test_get_or_create_pam_user_reraises_non_duplicate_integrity_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cur = AsyncMock()
    cur.fetchone.return_value = None
    cur.execute.side_effect = [None, aiomysql.IntegrityError(1452, "Cannot add foreign key constraint")]
    conn = _fake_conn(cur)

    @asynccontextmanager
    async def fake_get_connection(name: str):
        yield conn

    monkeypatch.setattr("shared.services.user.get_connection", fake_get_connection)
    redis = AsyncMock()
    redis.get.return_value = None

    with pytest.raises(aiomysql.IntegrityError):
        await get_or_create_pam_user(redis, site_id=1, user_id="u1")
