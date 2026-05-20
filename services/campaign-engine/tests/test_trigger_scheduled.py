from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.triggers.scheduled import _execute_campaign, _poll_oneoff_campaigns


@pytest.fixture
def make_async_gen():
    """Helper to create an async generator mock from a list of batches."""
    def _make(batches):
        async def _gen(*args, **kwargs):
            for batch in batches:
                yield batch
        return _gen
    return _make


@pytest.mark.asyncio
@patch("app.triggers.scheduled.update_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.scheduled.mark_sent", new_callable=AsyncMock)
@patch("app.triggers.scheduled.emit_send_job", new_callable=AsyncMock)
@patch("app.triggers.scheduled.check_rate_limit", new_callable=AsyncMock)
@patch("app.triggers.scheduled.is_in_audience", new_callable=AsyncMock)
@patch("app.triggers.scheduled.insert_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.scheduled.stream_segment_members")
async def test_execute_sends_to_all_members(
    mock_stream,
    mock_insert_run,
    mock_in_audience,
    mock_rate_limit,
    mock_emit,
    mock_mark_sent,
    mock_update_run,
    scheduled_campaign,
    mock_db,
    mock_redis,
    mock_producer,
    make_async_gen,
):
    mock_stream.return_value = make_async_gen([["user_1", "user_2", "user_3"]])(mock_db, "proj_abc123", "seg_pro")
    mock_insert_run.return_value = "run_001"
    mock_in_audience.return_value = True
    mock_rate_limit.return_value = True

    await _execute_campaign(scheduled_campaign, mock_db, mock_redis, mock_producer)

    assert mock_emit.await_count == 3
    assert mock_mark_sent.await_count == 3
    # Run should be marked completed with correct counts
    update_call = mock_update_run.call_args[0]
    assert update_call[3]["sent_count"] == 3
    assert update_call[3]["skipped_count"] == 0
    assert update_call[3]["status"] == "completed"


@pytest.mark.asyncio
@patch("app.triggers.scheduled.update_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.scheduled.emit_send_job", new_callable=AsyncMock)
@patch("app.triggers.scheduled.check_rate_limit", new_callable=AsyncMock)
@patch("app.triggers.scheduled.is_in_audience", new_callable=AsyncMock)
@patch("app.triggers.scheduled.insert_campaign_run", new_callable=AsyncMock)
@patch("app.triggers.scheduled.stream_segment_members")
async def test_execute_skips_rate_limited_users(
    mock_stream,
    mock_insert_run,
    mock_in_audience,
    mock_rate_limit,
    mock_emit,
    mock_update_run,
    scheduled_campaign,
    mock_db,
    mock_redis,
    mock_producer,
    make_async_gen,
):
    mock_stream.return_value = make_async_gen([["user_1", "user_2"]])(mock_db, "proj_abc123", "seg_pro")
    mock_insert_run.return_value = "run_001"
    mock_in_audience.return_value = True
    mock_rate_limit.side_effect = [True, False]  # user_1 allowed, user_2 skipped

    await _execute_campaign(scheduled_campaign, mock_db, mock_redis, mock_producer)

    assert mock_emit.await_count == 1
    update_call = mock_update_run.call_args[0]
    assert update_call[3]["sent_count"] == 1
    assert update_call[3]["skipped_count"] == 1


@pytest.mark.asyncio
@patch("app.triggers.scheduled._execute_campaign", new_callable=AsyncMock)
@patch("app.triggers.scheduled.update_campaign", new_callable=AsyncMock)
@patch("app.triggers.scheduled.get_due_oneoff_campaigns", new_callable=AsyncMock)
async def test_poll_oneoff_finds_and_executes_due_campaigns(
    mock_get_due,
    mock_update_campaign,
    mock_execute,
    scheduled_campaign,
    mock_db,
    mock_redis,
    mock_producer,
):
    from datetime import timezone
    oneoff_doc = {
        "campaign_id": "camp_oneoff",
        "project_id": "proj_abc123",
        "name": "Flash Sale",
        "status": "scheduled",
        "trigger": {"type": "one_off", "send_at": datetime.now(timezone.utc).isoformat()},
        "audience": {"segment_id": "seg_all", "all": False},
        "channel": "push",
        "template_id": "tmpl_flash",
        "rate_limit": {"per_user_per_day": 1},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    mock_get_due.return_value = [oneoff_doc]
    mock_update_campaign.return_value = True

    await _poll_oneoff_campaigns(mock_db, mock_redis, mock_producer)

    mock_execute.assert_awaited_once()
    # Should update status to running before execute, and completed after
    assert mock_update_campaign.await_count == 2
    first_status = mock_update_campaign.call_args_list[0][0][3]["status"]
    second_status = mock_update_campaign.call_args_list[1][0][3]["status"]
    assert first_status == "running"
    assert second_status == "completed"


@pytest.mark.asyncio
@patch("app.triggers.scheduled._execute_campaign", new_callable=AsyncMock)
@patch("app.triggers.scheduled.update_campaign", new_callable=AsyncMock)
@patch("app.triggers.scheduled.get_due_oneoff_campaigns", new_callable=AsyncMock)
async def test_poll_oneoff_skips_if_status_update_fails(
    mock_get_due,
    mock_update_campaign,
    mock_execute,
    mock_db,
    mock_redis,
    mock_producer,
):
    from datetime import timezone
    oneoff_doc = {
        "campaign_id": "camp_oneoff",
        "project_id": "proj_abc123",
        "name": "Flash Sale",
        "status": "scheduled",
        "trigger": {"type": "one_off", "send_at": datetime.now(timezone.utc).isoformat()},
        "audience": {"all": True},
        "channel": "push",
        "template_id": "tmpl_flash",
        "rate_limit": {"per_user_per_day": 1},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    mock_get_due.return_value = [oneoff_doc]
    # Simulate another instance already claimed it (update matched 0 docs)
    mock_update_campaign.return_value = False

    await _poll_oneoff_campaigns(mock_db, mock_redis, mock_producer)

    mock_execute.assert_not_awaited()
