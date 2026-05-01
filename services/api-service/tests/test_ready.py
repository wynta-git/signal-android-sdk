from unittest.mock import AsyncMock, MagicMock

import pytest

from app.routes.ready import ready


@pytest.fixture
def mock_request() -> MagicMock:
    redis = AsyncMock()
    redis.ping = AsyncMock()

    forwarder = AsyncMock()
    forwarder.ping = AsyncMock()

    request = MagicMock()
    request.app.state.redis = redis
    request.app.state.forwarder = forwarder
    return request


class TestReadyRoute:
    async def test_all_healthy_returns_200(self, mock_request: MagicMock) -> None:
        response = await ready(mock_request)

        assert response.status_code == 200
        body = response.body
        import json
        data = json.loads(body)
        assert data["status"] == "ok"
        assert data["checks"]["redis"] == "ok"
        assert data["checks"]["event_handler"] == "ok"

    async def test_redis_down_returns_503(self, mock_request: MagicMock) -> None:
        mock_request.app.state.redis.ping = AsyncMock(side_effect=Exception("connection refused"))

        response = await ready(mock_request)

        assert response.status_code == 503
        import json
        data = json.loads(response.body)
        assert data["status"] == "degraded"
        assert data["checks"]["redis"] == "unreachable"
        assert data["checks"]["event_handler"] == "ok"

    async def test_event_handler_down_returns_503(self, mock_request: MagicMock) -> None:
        mock_request.app.state.forwarder.ping = AsyncMock(side_effect=Exception("timeout"))

        response = await ready(mock_request)

        assert response.status_code == 503
        import json
        data = json.loads(response.body)
        assert data["status"] == "degraded"
        assert data["checks"]["redis"] == "ok"
        assert data["checks"]["event_handler"] == "unreachable"

    async def test_both_down_returns_503(self, mock_request: MagicMock) -> None:
        mock_request.app.state.redis.ping = AsyncMock(side_effect=Exception("down"))
        mock_request.app.state.forwarder.ping = AsyncMock(side_effect=Exception("down"))

        response = await ready(mock_request)

        assert response.status_code == 503
        import json
        data = json.loads(response.body)
        assert data["status"] == "degraded"
        assert data["checks"]["redis"] == "unreachable"
        assert data["checks"]["event_handler"] == "unreachable"

    async def test_version_included(self, mock_request: MagicMock) -> None:
        response = await ready(mock_request)

        import json
        data = json.loads(response.body)
        assert "version" in data
