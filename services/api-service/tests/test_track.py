from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.auth.token import TokenContext
from app.middleware.ratelimit import project_rate_limit
from app.routes.track import MAX_EVENTS_PER_BATCH, TrackRequest, _map_validation_error, track
from shared.models.events import EventEnvelope


# --- Fixtures ---

@pytest.fixture
def ctx() -> TokenContext:
    return TokenContext(project_id="proj_abc123", scope=["events:write"], env="live")


@pytest.fixture
def valid_event() -> dict[str, Any]:
    return {
        "event_id": str(uuid4()),
        "event_name": "screen_viewed",
        "user_id": "user_42",
        "timestamp": "2026-05-01T10:00:00Z",
        "sdk": {"name": "pam-web", "version": "1.0.0"},
        "properties": {"screen_name": "home"},
    }


@pytest.fixture
def mock_request(ctx: TokenContext) -> MagicMock:
    redis = AsyncMock()
    pipe = AsyncMock()
    pipe.__aenter__ = AsyncMock(return_value=pipe)
    pipe.__aexit__ = AsyncMock(return_value=False)
    pipe.incr = AsyncMock()
    pipe.expire = AsyncMock()
    pipe.execute = AsyncMock(return_value=[1, True])
    redis.pipeline.return_value = pipe

    forwarder = AsyncMock()
    forwarder.send_events = AsyncMock()

    request = MagicMock()
    request.app.state.redis = redis
    request.app.state.forwarder = forwarder
    return request


# --- EventEnvelope model tests ---

class TestEventEnvelope:
    def test_valid_screen_viewed(self, valid_event: dict) -> None:
        env = EventEnvelope.model_validate(valid_event)
        assert env.event_name == "screen_viewed"
        assert env.user_id == "user_42"

    def test_unknown_event_name_raises(self, valid_event: dict) -> None:
        valid_event["event_name"] = "not_a_real_event"
        with pytest.raises(ValidationError) as exc:
            EventEnvelope.model_validate(valid_event)
        assert "unknown_event" in str(exc.value)

    def test_missing_required_property_raises(self, valid_event: dict) -> None:
        valid_event["event_name"] = "screen_viewed"
        valid_event["properties"] = {}  # screen_name is required
        with pytest.raises(ValidationError):
            EventEnvelope.model_validate(valid_event)

    def test_unknown_properties_are_accepted(self, valid_event: dict) -> None:
        valid_event["properties"]["extra_field"] = "forward_compat"
        env = EventEnvelope.model_validate(valid_event)
        assert env.properties["extra_field"] == "forward_compat"

    def test_project_id_defaults_to_none(self, valid_event: dict) -> None:
        env = EventEnvelope.model_validate(valid_event)
        assert env.project_id is None

    def test_purchase_completed_valid(self) -> None:
        event = {
            "event_id": str(uuid4()),
            "event_name": "purchase_completed",
            "user_id": "user_42",
            "timestamp": "2026-05-01T10:00:00Z",
            "sdk": {"name": "pam-web", "version": "1.0.0"},
            "properties": {"order_id": "ord_1", "amount": 999.0, "currency": "INR"},
        }
        env = EventEnvelope.model_validate(event)
        assert env.properties["currency"] == "INR"

    def test_purchase_completed_missing_amount_raises(self) -> None:
        event = {
            "event_id": str(uuid4()),
            "event_name": "purchase_completed",
            "user_id": "user_42",
            "timestamp": "2026-05-01T10:00:00Z",
            "sdk": {"name": "pam-web", "version": "1.0.0"},
            "properties": {"order_id": "ord_1", "currency": "INR"},  # missing amount
        }
        with pytest.raises(ValidationError):
            EventEnvelope.model_validate(event)


# --- Track route handler tests ---

class TestTrackRoute:
    async def test_valid_batch_accepted(
        self, mock_request: MagicMock, ctx: TokenContext, valid_event: dict
    ) -> None:
        body = TrackRequest(events=[valid_event])
        response = await track(mock_request, body, ctx)

        assert response.accepted == 1
        assert response.rejected == 0
        assert response.errors == []

    async def test_invalid_event_partially_rejected(
        self, mock_request: MagicMock, ctx: TokenContext, valid_event: dict
    ) -> None:
        bad_event = {**valid_event, "event_name": "unknown_event_xyz"}
        body = TrackRequest(events=[valid_event, bad_event])
        response = await track(mock_request, body, ctx)

        assert response.accepted == 1
        assert response.rejected == 1
        assert response.errors[0].code == "unknown_event"
        assert response.errors[0].index == 1

    async def test_missing_required_field_rejected(
        self, mock_request: MagicMock, ctx: TokenContext, valid_event: dict
    ) -> None:
        bad_event = {**valid_event, "properties": {}}  # missing screen_name
        body = TrackRequest(events=[bad_event])
        response = await track(mock_request, body, ctx)

        assert response.accepted == 0
        assert response.rejected == 1
        assert response.errors[0].code == "missing_required"

    async def test_project_id_injected_from_token(
        self, mock_request: MagicMock, ctx: TokenContext, valid_event: dict
    ) -> None:
        body = TrackRequest(events=[valid_event])
        await track(mock_request, body, ctx)

        forwarded = mock_request.app.state.forwarder.send_events.call_args[0][0]
        assert forwarded[0]["project_id"] == "proj_abc123"

    async def test_received_at_set_server_side(
        self, mock_request: MagicMock, ctx: TokenContext, valid_event: dict
    ) -> None:
        before = datetime.now(timezone.utc)
        body = TrackRequest(events=[valid_event])
        await track(mock_request, body, ctx)
        after = datetime.now(timezone.utc)

        forwarded = mock_request.app.state.forwarder.send_events.call_args[0][0]
        received_at = datetime.fromisoformat(forwarded[0]["received_at"])
        assert before <= received_at <= after

    async def test_over_100_events_raises_400(
        self, mock_request: MagicMock, ctx: TokenContext, valid_event: dict
    ) -> None:
        from fastapi import HTTPException
        body = TrackRequest(events=[valid_event] * (MAX_EVENTS_PER_BATCH + 1))
        with pytest.raises(HTTPException) as exc:
            await track(mock_request, body, ctx)
        assert exc.value.status_code == 400
        assert exc.value.detail["code"] == "payload_too_large"

    async def test_forwarder_not_called_when_all_rejected(
        self, mock_request: MagicMock, ctx: TokenContext, valid_event: dict
    ) -> None:
        bad_event = {**valid_event, "event_name": "bad_event"}
        body = TrackRequest(events=[bad_event])
        await track(mock_request, body, ctx)

        mock_request.app.state.forwarder.send_events.assert_not_called()

    async def test_forwarder_failure_raises_502(
        self, mock_request: MagicMock, ctx: TokenContext, valid_event: dict
    ) -> None:
        from fastapi import HTTPException
        mock_request.app.state.forwarder.send_events = AsyncMock(side_effect=Exception("down"))
        body = TrackRequest(events=[valid_event])

        with pytest.raises(HTTPException) as exc:
            await track(mock_request, body, ctx)
        assert exc.value.status_code == 502
