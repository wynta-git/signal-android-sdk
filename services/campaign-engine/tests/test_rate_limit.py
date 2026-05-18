from unittest.mock import AsyncMock, patch

import pytest

from app.models import RateLimit
from app.rate_limit import check_rate_limit, mark_sent


@pytest.mark.asyncio
@patch("app.rate_limit.get_str", new_callable=AsyncMock)
async def test_allows_first_send(mock_get_str, base_campaign, mock_redis):
    mock_get_str.return_value = None  # no prior sends
    result = await check_rate_limit(base_campaign, "user_1", mock_redis)
    assert result is True


@pytest.mark.asyncio
@patch("app.rate_limit.get_str", new_callable=AsyncMock)
async def test_blocks_on_per_day_exceeded(mock_get_str, base_campaign, mock_redis):
    # per_user_per_day=1, already sent once today
    mock_get_str.return_value = "1"
    result = await check_rate_limit(base_campaign, "user_1", mock_redis)
    assert result is False


@pytest.mark.asyncio
@patch("app.rate_limit.get_str", new_callable=AsyncMock)
async def test_blocks_on_campaign_total_exceeded(mock_get_str, mock_redis):
    from datetime import datetime, timezone
    from app.models import Audience, Campaign, RateLimit, Trigger

    campaign = Campaign(
        campaign_id="camp_t",
        project_id="proj_1",
        name="T",
        status="running",
        trigger=Trigger(type="event", event_name="purchase"),
        audience=Audience(all=True),
        channel="push",
        template_id="tmpl_1",
        rate_limit=RateLimit(per_user_per_day=10, per_user_per_campaign_total=1),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    # day count is 0, but total count is at limit
    mock_get_str.side_effect = ["0", "1"]
    result = await check_rate_limit(campaign, "user_1", mock_redis)
    assert result is False


@pytest.mark.asyncio
@patch("app.rate_limit.get_str", new_callable=AsyncMock)
async def test_allows_when_under_all_limits(mock_get_str, mock_redis):
    from datetime import datetime, timezone
    from app.models import Audience, Campaign, RateLimit, Trigger

    campaign = Campaign(
        campaign_id="camp_t",
        project_id="proj_1",
        name="T",
        status="running",
        trigger=Trigger(type="event", event_name="purchase"),
        audience=Audience(all=True),
        channel="push",
        template_id="tmpl_1",
        rate_limit=RateLimit(per_user_per_day=3, per_user_per_campaign_total=5),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_get_str.side_effect = ["2", "3"]  # both under limits
    result = await check_rate_limit(campaign, "user_1", mock_redis)
    assert result is True


@pytest.mark.asyncio
@patch("app.rate_limit.incr_with_expire", new_callable=AsyncMock)
async def test_mark_sent_increments_day_counter(mock_incr, base_campaign, mock_redis):
    await mark_sent(base_campaign, "user_1", mock_redis)
    assert mock_incr.await_count == 1  # only day counter (no total limit configured)


@pytest.mark.asyncio
@patch("app.rate_limit.incr_with_expire", new_callable=AsyncMock)
async def test_mark_sent_increments_both_counters(mock_incr, mock_redis):
    from datetime import datetime, timezone
    from app.models import Audience, Campaign, RateLimit, Trigger

    campaign = Campaign(
        campaign_id="camp_t",
        project_id="proj_1",
        name="T",
        status="running",
        trigger=Trigger(type="event", event_name="purchase"),
        audience=Audience(all=True),
        channel="push",
        template_id="tmpl_1",
        rate_limit=RateLimit(per_user_per_day=3, per_user_per_campaign_total=5),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    await mark_sent(campaign, "user_1", mock_redis)
    assert mock_incr.await_count == 2  # day + total
