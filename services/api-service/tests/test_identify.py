from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from shared.auth.token import TokenContext
from app.routes.identify import IdentifyRequest, identify


@pytest.fixture
def ctx() -> TokenContext:
    return TokenContext(project_id="proj_abc123", scope=["events:write"], env="live")


@pytest.fixture
def valid_body() -> IdentifyRequest:
    return IdentifyRequest(
        user_id="user_42",
        anonymous_id="anon_xyz",
        traits={"name": "Asha", "plan": "pro"},
        timestamp="2026-05-01T10:00:00Z",
    )


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
    forwarder.send_identify = AsyncMock()

    request = MagicMock()
    request.app.state.redis = redis
    request.app.state.forwarder = forwarder
    return request


class TestIdentifyRoute:
    async def test_valid_request_returns_user_id(
        self, mock_request: MagicMock, valid_body: IdentifyRequest, ctx: TokenContext
    ) -> None:
        response = await identify(mock_request, valid_body, ctx)
        assert response.user_id == "user_42"

    async def test_project_id_injected_from_token(
        self, mock_request: MagicMock, valid_body: IdentifyRequest, ctx: TokenContext
    ) -> None:
        await identify(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_identify.call_args[0][0]
        assert forwarded["project_id"] == "proj_abc123"

    async def test_received_at_set_server_side(
        self, mock_request: MagicMock, valid_body: IdentifyRequest, ctx: TokenContext
    ) -> None:
        await identify(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_identify.call_args[0][0]
        assert "received_at" in forwarded
        assert forwarded["received_at"] is not None

    async def test_event_id_generated(
        self, mock_request: MagicMock, valid_body: IdentifyRequest, ctx: TokenContext
    ) -> None:
        await identify(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_identify.call_args[0][0]
        assert "event_id" in forwarded
        assert len(forwarded["event_id"]) == 36  # UUID format

    async def test_anonymous_id_forwarded(
        self, mock_request: MagicMock, valid_body: IdentifyRequest, ctx: TokenContext
    ) -> None:
        await identify(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_identify.call_args[0][0]
        assert forwarded["anonymous_id"] == "anon_xyz"

    async def test_anonymous_id_optional(
        self, mock_request: MagicMock, ctx: TokenContext
    ) -> None:
        body = IdentifyRequest(user_id="user_42", timestamp="2026-05-01T10:00:00Z")
        response = await identify(mock_request, body, ctx)

        assert response.user_id == "user_42"
        forwarded = mock_request.app.state.forwarder.send_identify.call_args[0][0]
        assert forwarded["anonymous_id"] is None

    async def test_traits_forwarded(
        self, mock_request: MagicMock, valid_body: IdentifyRequest, ctx: TokenContext
    ) -> None:
        await identify(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_identify.call_args[0][0]
        assert forwarded["traits"]["name"] == "Asha"
        assert forwarded["traits"]["plan"] == "pro"

    async def test_forwarder_failure_raises_502(
        self, mock_request: MagicMock, valid_body: IdentifyRequest, ctx: TokenContext
    ) -> None:
        mock_request.app.state.forwarder.send_identify = AsyncMock(side_effect=Exception("down"))

        with pytest.raises(HTTPException) as exc:
            await identify(mock_request, valid_body, ctx)
        assert exc.value.status_code == 502
        assert exc.value.detail["code"] == "internal_error"

    async def test_rate_limited_user_raises_429(
        self, mock_request: MagicMock, valid_body: IdentifyRequest, ctx: TokenContext
    ) -> None:
        mock_request.app.state.redis.pipeline.return_value.__aenter__.return_value.execute = (
            AsyncMock(return_value=[101, True])  # over user limit
        )

        with pytest.raises(HTTPException) as exc:
            await identify(mock_request, valid_body, ctx)
        assert exc.value.status_code == 429
