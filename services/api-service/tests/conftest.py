import hashlib
import json
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture
def live_token() -> str:
    return "pam_live_abc123def456ghi789jkl012mno345pq"


@pytest.fixture
def test_token() -> str:
    return "pam_test_abc123def456ghi789jkl012mno345pq"


@pytest.fixture
def token_hash(live_token: str) -> str:
    return hashlib.sha256(live_token.encode()).hexdigest()


@pytest.fixture
def cached_payload() -> str:
    return json.dumps({"project_id": "proj_abc123", "scope": ["events:write"], "env": "live"})


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    redis.exists.return_value = 0   # no revocation flag
    redis.get.return_value = None   # cache miss by default
    redis.set.return_value = True
    return redis


@pytest.fixture
def mock_db() -> MagicMock:
    collection = MagicMock()
    collection.find_one = AsyncMock(
        return_value={"project_id": "proj_abc123", "scope": ["events:write"]}
    )
    collection.update_one = AsyncMock()
    db = MagicMock()
    db.__getitem__.return_value = collection
    return db
