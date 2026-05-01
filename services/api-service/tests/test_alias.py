from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.auth.token import TokenContext
from app.routes.alias import AliasRequest, alias


@pytest.fixture
def ctx() -> TokenContext:
    return TokenContext(project_id="proj_abc123", scope=["events:write"], env="live")


@pytest.fixture
def valid_body() -> AliasRequest:
    return AliasRequest(previous_user_id="user_web_123", user_id="user_google_456")


@pytest.fixture
def mock_request() -> MagicMock:
    redis = AsyncMock()
    pipe = AsyncMock()
    pipe.__aenter__ = AsyncMock(return_value=pipe)
    pipe.__aexit__ = AsyncMock(return_value=False)
    pipe.incr = AsyncMock()
    pipe.expire = AsyncMock()
    pipe.execute = AsyncMock(return_value=[1, True])
    redis.pipeline.return_value = pipe

    forwarder = AsyncMock()
    forwarder.send_alias = AsyncMock()

    request = MagicMock()
    request.app.state.redis = redis
    request.app.state.forwarder = forwarder
    return request


class TestAliasRoute:
    async def test_valid_request_returns_both_ids(
        self, mock_request: MagicMock, valid_body: AliasRequest, ctx: TokenContext
    ) -> None:
        response = await alias(mock_request, valid_body, ctx)

        assert response.previous_user_id == "user_web_123"
        assert response.user_id == "user_google_456"

    async def test_project_id_injected_from_token(
        self, mock_request: MagicMock, valid_body: AliasRequest, ctx: TokenContext
    ) -> None:
        await alias(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_alias.call_args[0][0]
        assert forwarded["project_id"] == "proj_abc123"

    async def test_both_user_ids_forwarded(
        self, mock_request: MagicMock, valid_body: AliasRequest, ctx: TokenContext
    ) -> None:
        await alias(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_alias.call_args[0][0]
        assert forwarded["previous_user_id"] == "user_web_123"
        assert forwarded["user_id"] == "user_google_456"

    async def test_event_id_generated(
        self, mock_request: MagicMock, valid_body: AliasRequest, ctx: TokenContext
    ) -> None:
        await alias(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_alias.call_args[0][0]
        assert "event_id" in forwarded
        assert len(forwarded["event_id"]) == 36

    async def test_received_at_set_server_side(
        self, mock_request: MagicMock, valid_body: AliasRequest, ctx: TokenContext
    ) -> None:
        await alias(mock_request, valid_body, ctx)

        forwarded = mock_request.app.state.forwarder.send_alias.call_args[0][0]
        assert "received_at" in forwarded

    async def test_forwarder_failure_raises_502(
        self, mock_request: MagicMock, valid_body: AliasRequest, ctx: TokenContext
    ) -> None:
        mock_request.app.state.forwarder.send_alias = AsyncMock(side_effect=Exception("down"))

        with pytest.raises(HTTPException) as exc:
            await alias(mock_request, valid_body, ctx)
        assert exc.value.status_code == 502
        assert exc.value.detail["code"] == "internal_error"
