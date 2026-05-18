from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.triggers.event import _handle_event


@pytest.fixture
def sample_event(base_campaign):
    return {
        "event_id": "evt_001",
        "event_name": "cart_abandoned",
        "project_id": base_campaign.project_id,
        "user_id": "user_42",
        "properties": {"cart_value": 49.99},
    }


@pytest.mark.asyncio
@patch("app.triggers.event.emit_send_job", new_callable=AsyncMock)
@patch("app.triggers.event.mark_sent", new_callable=AsyncMock)
@patch("app.triggers.event.check_rate_limit", new_callable=AsyncMock)
@patch("app.triggers.event.is_in_audience", new_callable=AsyncMock)
@patch("app.triggers.event.get_active_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.event.insert_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.event.get_running_campaigns_for_event", new_callable=AsyncMock)
async def test_matching_event_emits_send_job(
    mock_get_campaigns,
    mock_insert_run,
    mock_get_run,
    mock_in_audience,
    mock_rate_limit,
    mock_mark_sent,
    mock_emit,
    sample_event,
    base_campaign,
    mock_db,
    mock_redis,
    mock_producer,
):
    mock_get_campaigns.return_value = [base_campaign.model_dump(mode="json")]
    mock_get_run.return_value = None
    mock_insert_run.return_value = "run_001"
    mock_in_audience.return_value = True
    mock_rate_limit.return_value = True

    await _handle_event(sample_event, mock_db, mock_redis, mock_producer)

    mock_emit.assert_awaited_once()
    mock_mark_sent.assert_awaited_once()
    call_kwargs = mock_emit.call_args[1]
    assert call_kwargs["user_id"] == "user_42"
    assert call_kwargs["campaign"].campaign_id == base_campaign.campaign_id


@pytest.mark.asyncio
@patch("app.triggers.event.get_running_campaigns_for_event", new_callable=AsyncMock)
async def test_no_matching_campaigns_does_nothing(
    mock_get_campaigns, sample_event, mock_db, mock_redis, mock_producer
):
    mock_get_campaigns.return_value = []
    # No exception, no send
    await _handle_event(sample_event, mock_db, mock_redis, mock_producer)
    mock_get_campaigns.assert_awaited_once()


@pytest.mark.asyncio
@patch("app.triggers.event.emit_send_job", new_callable=AsyncMock)
@patch("app.triggers.event.is_in_audience", new_callable=AsyncMock)
@patch("app.triggers.event.get_active_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.event.insert_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.event.get_running_campaigns_for_event", new_callable=AsyncMock)
async def test_user_not_in_audience_skips(
    mock_get_campaigns,
    mock_insert_run,
    mock_get_run,
    mock_in_audience,
    mock_emit,
    sample_event,
    base_campaign,
    mock_db,
    mock_redis,
    mock_producer,
):
    mock_get_campaigns.return_value = [base_campaign.model_dump(mode="json")]
    mock_get_run.return_value = {"run_id": "run_existing"}
    mock_in_audience.return_value = False

    await _handle_event(sample_event, mock_db, mock_redis, mock_producer)

    mock_emit.assert_not_awaited()


@pytest.mark.asyncio
@patch("app.triggers.event.emit_send_job", new_callable=AsyncMock)
@patch("app.triggers.event.check_rate_limit", new_callable=AsyncMock)
@patch("app.triggers.event.is_in_audience", new_callable=AsyncMock)
@patch("app.triggers.event.get_active_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.event.insert_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.event.get_running_campaigns_for_event", new_callable=AsyncMock)
async def test_rate_limited_user_skips(
    mock_get_campaigns,
    mock_insert_run,
    mock_get_run,
    mock_in_audience,
    mock_rate_limit,
    mock_emit,
    sample_event,
    base_campaign,
    mock_db,
    mock_redis,
    mock_producer,
):
    mock_get_campaigns.return_value = [base_campaign.model_dump(mode="json")]
    mock_get_run.return_value = {"run_id": "run_existing"}
    mock_in_audience.return_value = True
    mock_rate_limit.return_value = False

    await _handle_event(sample_event, mock_db, mock_redis, mock_producer)

    mock_emit.assert_not_awaited()


@pytest.mark.asyncio
@patch("app.triggers.event.emit_send_job", new_callable=AsyncMock)
@patch("app.triggers.event.mark_sent", new_callable=AsyncMock)
@patch("app.triggers.event.check_rate_limit", new_callable=AsyncMock)
@patch("app.triggers.event.is_in_audience", new_callable=AsyncMock)
@patch("app.triggers.event.get_active_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.event.insert_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.event.get_running_campaigns_for_event", new_callable=AsyncMock)
async def test_delay_sets_deliver_at_in_future(
    mock_get_campaigns,
    mock_insert_run,
    mock_get_run,
    mock_in_audience,
    mock_rate_limit,
    mock_mark_sent,
    mock_emit,
    base_campaign,
    mock_db,
    mock_redis,
    mock_producer,
):
    from app.models import Delay

    campaign_with_delay = base_campaign.model_copy(update={"delay": Delay(minutes=30)})
    mock_get_campaigns.return_value = [campaign_with_delay.model_dump(mode="json")]
    mock_get_run.return_value = None
    mock_insert_run.return_value = "run_001"
    mock_in_audience.return_value = True
    mock_rate_limit.return_value = True

    event = {
        "event_id": "evt_002",
        "event_name": "cart_abandoned",
        "project_id": base_campaign.project_id,
        "user_id": "user_42",
        "properties": {},
    }
    await _handle_event(event, mock_db, mock_redis, mock_producer)

    deliver_at = mock_emit.call_args[1]["deliver_at"]
    now = datetime.now(timezone.utc)
    diff = (deliver_at - now).total_seconds()
    assert 25 * 60 <= diff <= 35 * 60  # roughly 30 minutes ahead
