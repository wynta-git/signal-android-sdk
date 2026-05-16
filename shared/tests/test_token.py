from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from shared.auth.token import InvalidTokenError, TokenContext, validate_token


class TestTokenContext:
    def test_exact_scope_match(self) -> None:
        ctx = TokenContext(project_id="proj_abc", scope=["events:write"], env="live")
        assert ctx.has_scope("events:write")

    def test_missing_scope(self) -> None:
        ctx = TokenContext(project_id="proj_abc", scope=["events:write"], env="live")
        assert not ctx.has_scope("read")

    def test_admin_satisfies_any_scope(self) -> None:
        ctx = TokenContext(project_id="proj_abc", scope=["admin"], env="live")
        assert ctx.has_scope("events:write")
        assert ctx.has_scope("read")
        assert ctx.has_scope("anything")

    def test_frozen(self) -> None:
        ctx = TokenContext(project_id="proj_abc", scope=["events:write"], env="live")
        with pytest.raises(Exception):
            ctx.project_id = "other"  # type: ignore[misc]


class TestValidateToken:
    async def test_cache_hit_skips_mongo(
        self, live_token: str, mock_redis: AsyncMock, mock_db: MagicMock, cached_payload: str
    ) -> None:
        ctx = await validate_token(live_token, revoked=False, token_raw=cached_payload, redis=mock_redis, db=mock_db)

        assert ctx.project_id == "proj_abc123"
        assert ctx.env == "live"
        mock_db.__getitem__.return_value.find_one.assert_not_called()

    async def test_cache_miss_queries_mongo(
        self, live_token: str, mock_redis: AsyncMock, mock_db: MagicMock
    ) -> None:
        with patch("asyncio.create_task"):
            ctx = await validate_token(live_token, revoked=False, token_raw=None, redis=mock_redis, db=mock_db)

        assert ctx.project_id == "proj_abc123"
        assert ctx.scope == ["events:write"]
        assert ctx.env == "live"
        mock_db.__getitem__.return_value.find_one.assert_called_once()

    async def test_cache_miss_populates_cache(
        self, live_token: str, mock_redis: AsyncMock, mock_db: MagicMock
    ) -> None:
        with patch("asyncio.create_task"):
            await validate_token(live_token, revoked=False, token_raw=None, redis=mock_redis, db=mock_db)

        mock_redis.set.assert_called_once()
        _, kwargs = mock_redis.set.call_args
        assert kwargs.get("ex") == 300

    async def test_revoked_raises(
        self, live_token: str, mock_redis: AsyncMock, mock_db: MagicMock, cached_payload: str
    ) -> None:
        with pytest.raises(InvalidTokenError):
            await validate_token(live_token, revoked=True, token_raw=cached_payload, redis=mock_redis, db=mock_db)

        mock_db.__getitem__.return_value.find_one.assert_not_called()

    async def test_unknown_token_raises(
        self, live_token: str, mock_redis: AsyncMock, mock_db: MagicMock
    ) -> None:
        mock_db.__getitem__.return_value.find_one = AsyncMock(return_value=None)

        with pytest.raises(InvalidTokenError):
            await validate_token(live_token, revoked=False, token_raw=None, redis=mock_redis, db=mock_db)

    async def test_test_env_detected(
        self, test_token: str, mock_redis: AsyncMock, mock_db: MagicMock
    ) -> None:
        with patch("asyncio.create_task"):
            ctx = await validate_token(test_token, revoked=False, token_raw=None, redis=mock_redis, db=mock_db)
        assert ctx.env == "test"

    async def test_live_env_detected(
        self, live_token: str, mock_redis: AsyncMock, mock_db: MagicMock
    ) -> None:
        with patch("asyncio.create_task"):
            ctx = await validate_token(live_token, revoked=False, token_raw=None, redis=mock_redis, db=mock_db)
        assert ctx.env == "live"

    async def test_last_used_fired_on_cache_miss(
        self, live_token: str, mock_redis: AsyncMock, mock_db: MagicMock
    ) -> None:
        with patch("asyncio.create_task") as mock_create_task:
            await validate_token(live_token, revoked=False, token_raw=None, redis=mock_redis, db=mock_db)
        mock_create_task.assert_called_once()

    async def test_last_used_not_fired_on_cache_hit(
        self, live_token: str, mock_redis: AsyncMock, mock_db: MagicMock, cached_payload: str
    ) -> None:
        with patch("asyncio.create_task") as mock_create_task:
            await validate_token(live_token, revoked=False, token_raw=cached_payload, redis=mock_redis, db=mock_db)
        mock_create_task.assert_not_called()
