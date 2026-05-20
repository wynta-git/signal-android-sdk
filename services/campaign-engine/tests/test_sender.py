import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.sender import emit_send_job


@pytest.mark.asyncio
async def test_emit_send_job_sends_to_correct_topic(base_campaign, mock_producer):
    deliver_at = datetime.now(timezone.utc)
    await emit_send_job(
        mock_producer,
        campaign=base_campaign,
        campaign_run_id="run_001",
        user_id="user_42",
        deliver_at=deliver_at,
        context={"event_id": "evt_001"},
    )
    mock_producer.send.assert_awaited_once()
    topic = mock_producer.send.call_args[0][0]
    assert topic == "pam.campaigns.send.v1"


@pytest.mark.asyncio
async def test_emit_send_job_uses_user_id_as_key(base_campaign, mock_producer):
    await emit_send_job(
        mock_producer,
        campaign=base_campaign,
        campaign_run_id="run_001",
        user_id="user_42",
        deliver_at=datetime.now(timezone.utc),
    )
    key = mock_producer.send.call_args[1]["key"]
    assert key == b"user_42"


@pytest.mark.asyncio
async def test_emit_send_job_payload_fields(base_campaign, mock_producer):
    deliver_at = datetime.now(timezone.utc)
    ctx = {"event_id": "evt_abc", "event_properties": {"cart_value": 49.99}}

    await emit_send_job(
        mock_producer,
        campaign=base_campaign,
        campaign_run_id="run_007",
        user_id="user_99",
        deliver_at=deliver_at,
        context=ctx,
    )

    raw_value = mock_producer.send.call_args[1]["value"]
    payload = json.loads(raw_value.decode())

    assert payload["project_id"] == base_campaign.project_id
    assert payload["campaign_id"] == base_campaign.campaign_id
    assert payload["campaign_run_id"] == "run_007"
    assert payload["user_id"] == "user_99"
    assert payload["channel"] == "push"
    assert payload["template_id"] == base_campaign.template_id
    assert payload["context"] == ctx
    assert "send_id" in payload
    assert "deliver_at" in payload
