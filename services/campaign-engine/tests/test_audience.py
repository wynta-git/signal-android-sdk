from unittest.mock import AsyncMock, patch

import pytest

from app.audience import is_in_audience
from app.models import Audience


@pytest.mark.asyncio
async def test_all_audience_skips_lookup(mock_db, mock_redis):
    audience = Audience(all=True)
    result = await is_in_audience(audience, "proj_1", "user_1", mock_db, mock_redis)
    assert result is True


@pytest.mark.asyncio
async def test_no_segment_defaults_to_all(mock_db, mock_redis):
    audience = Audience()  # segment_id=None, all=False
    result = await is_in_audience(audience, "proj_1", "user_1", mock_db, mock_redis)
    assert result is True


@pytest.mark.asyncio
@patch("app.audience.get_str", new_callable=AsyncMock)
async def test_redis_cache_hit_member(mock_get_str, mock_db, mock_redis):
    mock_get_str.return_value = "1"
    audience = Audience(segment_id="seg_abc")

    result = await is_in_audience(audience, "proj_1", "user_1", mock_db, mock_redis)

    assert result is True
    mock_get_str.assert_awaited_once_with(mock_redis, "pam:seg:proj_1:seg_abc:user_1")


@pytest.mark.asyncio
@patch("app.audience.get_str", new_callable=AsyncMock)
async def test_redis_cache_hit_non_member(mock_get_str, mock_db, mock_redis):
    mock_get_str.return_value = "0"
    audience = Audience(segment_id="seg_abc")

    result = await is_in_audience(audience, "proj_1", "user_1", mock_db, mock_redis)

    assert result is False


@pytest.mark.asyncio
@patch("app.audience.set_with_ttl", new_callable=AsyncMock)
@patch("app.audience.is_segment_member", new_callable=AsyncMock)
@patch("app.audience.get_str", new_callable=AsyncMock)
async def test_cache_miss_member_in_mongo(
    mock_get_str, mock_is_member, mock_set_ttl, mock_db, mock_redis
):
    mock_get_str.return_value = None
    mock_is_member.return_value = True
    audience = Audience(segment_id="seg_abc")

    result = await is_in_audience(audience, "proj_1", "user_1", mock_db, mock_redis)

    assert result is True
    mock_is_member.assert_awaited_once_with(mock_db, "proj_1", "seg_abc", "user_1")
    mock_set_ttl.assert_awaited_once()
    # Should cache as "1"
    args = mock_set_ttl.call_args[0]
    assert args[2] == "1"


@pytest.mark.asyncio
@patch("app.audience.set_with_ttl", new_callable=AsyncMock)
@patch("app.audience.is_segment_member", new_callable=AsyncMock)
@patch("app.audience.get_str", new_callable=AsyncMock)
async def test_cache_miss_non_member_in_mongo(
    mock_get_str, mock_is_member, mock_set_ttl, mock_db, mock_redis
):
    mock_get_str.return_value = None
    mock_is_member.return_value = False
    audience = Audience(segment_id="seg_abc")

    result = await is_in_audience(audience, "proj_1", "user_1", mock_db, mock_redis)

    assert result is False
    # Should cache as "0" (negative caching)
    args = mock_set_ttl.call_args[0]
    assert args[2] == "0"
