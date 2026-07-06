"""Tests for shared.services.user.resolve_pam_id_from_brand."""

from unittest.mock import AsyncMock, patch

import pytest

from shared.services.user import resolve_pam_id_from_brand


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
