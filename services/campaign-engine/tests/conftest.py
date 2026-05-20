from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import Audience, Campaign, Delay, RateLimit, Trigger


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def mock_redis():
    return AsyncMock()


@pytest.fixture
def mock_producer():
    return AsyncMock()


@pytest.fixture
def base_campaign():
    return Campaign(
        campaign_id="camp_test001",
        project_id="proj_abc123",
        name="Test Campaign",
        status="running",
        trigger=Trigger(type="event", event_name="cart_abandoned"),
        audience=Audience(segment_id="seg_buyers"),
        channel="push",
        template_id="tmpl_cart001",
        rate_limit=RateLimit(per_user_per_day=1),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def scheduled_campaign():
    return Campaign(
        campaign_id="camp_sched001",
        project_id="proj_abc123",
        name="Weekly Digest",
        status="running",
        trigger=Trigger(type="scheduled", cron="0 9 * * MON"),
        audience=Audience(segment_id="seg_pro"),
        channel="email",
        template_id="tmpl_digest001",
        rate_limit=RateLimit(per_user_per_day=1),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
