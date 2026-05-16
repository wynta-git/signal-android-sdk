from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.middleware.ratelimit import (
    PROJECT_LIMIT_PER_MIN,
    USER_LIMIT_PER_MIN,
    _incr_and_check,
    project_rate_limit,
    user_rate_limit,
)
from shared.auth.token import TokenContext


@pytest.fixture
def ctx() -> TokenContext:
    return TokenContext(project_id="proj_abc123", scope=["events:write"], env="live")


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    pipe = AsyncMock()
    pipe.__aenter__ = AsyncMock(return_value=pipe)
    pipe.__aexit__ = AsyncMock(return_value=False)
    pipe.incr = AsyncMock()
    pipe.expire = AsyncMock()
    pipe.execute = AsyncMock(return_value=[1, True])  # count=1 by default
    redis.pipeline.return_value = pipe
    return redis


class TestIncrAndCheck:
    async def test_under_limit_passes(self, mock_redis: AsyncMock) -> None:
        mock_redis.pipeline.return_value.__aenter__.return_value.execute = AsyncMock(
            return_value=[PROJECT_LIMIT_PER_MIN, True]
        )
        await _incr_and_check(mock_redis, "some:key", PROJECT_LIMIT_PER_MIN)  # no exception

    async def test_over_limit_raises_429(self, mock_redis: AsyncMock) -> None:
        mock_redis.pipeline.return_value.__aenter__.return_value.execute = AsyncMock(
            return_value=[PROJECT_LIMIT_PER_MIN + 1, True]
        )
        with pytest.raises(HTTPException) as exc:
            await _incr_and_check(mock_redis, "some:key", PROJECT_LIMIT_PER_MIN)
        assert exc.value.status_code == 429
        assert exc.value.detail["code"] == "rate_limited"

    async def test_expire_always_called(self, mock_redis: AsyncMock) -> None:
        pipe = mock_redis.pipeline.return_value.__aenter__.return_value
        await _incr_and_check(mock_redis, "some:key", PROJECT_LIMIT_PER_MIN)
        pipe.expire.assert_called_once_with("some:key", 60)

    async def test_incr_and_expire_use_same_key(self, mock_redis: AsyncMock) -> None:
        pipe = mock_redis.pipeline.return_value.__aenter__.return_value
        await _incr_and_check(mock_redis, "test:key:123", PROJECT_LIMIT_PER_MIN)
        pipe.incr.assert_called_once_with("test:key:123")
        pipe.expire.assert_called_once_with("test:key:123", 60)


class TestProjectRateLimit:
    async def test_passes_under_limit(self, ctx: TokenContext, mock_redis: AsyncMock) -> None:
        request = MagicMock()
        request.app.state.redis = mock_redis

        with patch("app.middleware.ratelimit.get_token_context", return_value=ctx):
            result = await project_rate_limit(request, ctx)

        assert result == ctx

    async def test_key_contains_project_id(self, ctx: TokenContext, mock_redis: AsyncMock) -> None:
        request = MagicMock()
        request.app.state.redis = mock_redis
        pipe = mock_redis.pipeline.return_value.__aenter__.return_value

        await project_rate_limit(request, ctx)

        key_used = pipe.incr.call_args[0][0]
        assert "proj_abc123" in key_used
        assert key_used.startswith("pam:rate:proj:")

    async def test_blocks_over_limit(self, ctx: TokenContext, mock_redis: AsyncMock) -> None:
        mock_redis.pipeline.return_value.__aenter__.return_value.execute = AsyncMock(
            return_value=[PROJECT_LIMIT_PER_MIN + 1, True]
        )
        request = MagicMock()
        request.app.state.redis = mock_redis

        with pytest.raises(HTTPException) as exc:
            await project_rate_limit(request, ctx)
        assert exc.value.status_code == 429


class TestUserRateLimit:
    async def test_passes_under_limit(self, mock_redis: AsyncMock) -> None:
        await user_rate_limit("proj_abc123", "user_42", mock_redis)  # no exception

    async def test_key_contains_project_and_user(self, mock_redis: AsyncMock) -> None:
        pipe = mock_redis.pipeline.return_value.__aenter__.return_value
        await user_rate_limit("proj_abc123", "user_42", mock_redis)

        key_used = pipe.incr.call_args[0][0]
        assert "proj_abc123" in key_used
        assert "user_42" in key_used
        assert key_used.startswith("pam:rate:user:")

    async def test_blocks_over_limit(self, mock_redis: AsyncMock) -> None:
        mock_redis.pipeline.return_value.__aenter__.return_value.execute = AsyncMock(
            return_value=[USER_LIMIT_PER_MIN + 1, True]
        )
        with pytest.raises(HTTPException) as exc:
            await user_rate_limit("proj_abc123", "user_42", mock_redis)
        assert exc.value.status_code == 429
