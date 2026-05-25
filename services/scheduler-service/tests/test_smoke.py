"""Smoke tests — verify models and config load without errors."""
from app.models import ExecutionEvent
from datetime import datetime, timezone


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
