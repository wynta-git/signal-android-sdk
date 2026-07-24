"""Smoke tests — verify models and config load without errors."""
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models import ExecutionEvent


def test_execution_event_defaults() -> None:
    event = ExecutionEvent(
        campaign_id="camp_abc",
        project_id="proj_xyz",
        trigger_type="one_off",
        fired_at=datetime.now(timezone.utc),
    )
    assert event.attempt == 1
    assert len(event.run_id) > 0


def test_execution_event_round_trip() -> None:
    now = datetime.now(timezone.utc)
    event = ExecutionEvent(
        run_id="test-run-id",
        campaign_id="camp_abc",
        project_id="proj_xyz",
        trigger_type="scheduled",
        fired_at=now,
        attempt=2,
    )
    serialized = event.model_dump_json()
    restored = ExecutionEvent.model_validate_json(serialized)
    assert restored.run_id == "test-run-id"
    assert restored.trigger_type == "scheduled"
    assert restored.attempt == 2


# ---------------------------------------------------------------------------
# Grouped fan-out — batch size resolution and GroupedSendJob emission
# ---------------------------------------------------------------------------


def test_resolve_batch_size_uses_project_override() -> None:
    from app.sender import _resolve_batch_size

    assert _resolve_batch_size("email", {"email": 42}) == 42


def test_resolve_batch_size_falls_back_to_channel_default() -> None:
    from app.sender import _resolve_batch_size

    assert _resolve_batch_size("email", {}) == 500
    assert _resolve_batch_size("sms", {}) == 1000
    assert _resolve_batch_size("whatsapp", {}) == 10000


def test_resolve_batch_size_falls_back_to_global_default_for_unknown_channel() -> None:
    from app.sender import _resolve_batch_size

    assert _resolve_batch_size("telegram", {}) == 500


@pytest.mark.asyncio
async def test_emit_grouped_send_job_shape() -> None:
    from app.sender import _emit_grouped_send_job

    producer = AsyncMock()
    campaign = {
        "project_id": "proj_abc",
        "campaign_id": "camp_xyz",
        "channel": "email",
        "template_id": "tmpl_cart",
        "brand_id": None,
    }
    now = datetime.now(timezone.utc)

    await _emit_grouped_send_job(
        producer,
        campaign=campaign,
        run_id="run_001",
        user_ids=["u1", "u2", "u3"],
        deliver_at=now,
        topic="pam.campaigns.send.grouped.email.v1",
    )

    producer.send.assert_called_once()
    call = producer.send.call_args
    assert call.args[0] == "pam.campaigns.send.grouped.email.v1"
    assert call.kwargs["key"] == b"camp_xyz"
    job = json.loads(call.kwargs["value"])
    assert job["project_id"] == "proj_abc"
    assert job["channel"] == "email"
    assert job["user_ids"] == ["u1", "u2", "u3"]
    assert "user_id" not in job  # grouped shape, not the single-user SendJob shape


@pytest.mark.asyncio
async def test_process_user_grouped_marks_sent_and_skipped() -> None:
    from app.sender import _process_user_grouped

    redis = AsyncMock()
    with (
        patch("app.sender._in_audience", new=AsyncMock(return_value=True)),
        patch("app.sender._rate_allowed", new=AsyncMock(return_value=True)),
        patch("app.sender._mark_sent", new=AsyncMock()),
    ):
        status, uid = await _process_user_grouped(
            "user_1",
            audience={},
            rate_limit={},
            campaign_id="camp_xyz",
            project_id="proj_abc",
            redis=redis,
        )
    assert status == "sent"
    assert uid == "user_1"
