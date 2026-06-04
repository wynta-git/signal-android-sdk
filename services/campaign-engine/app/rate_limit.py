from datetime import date

import structlog
from redis.asyncio import Redis

from app.models import Campaign
from shared.clients.redis import get_str, incr_with_expire, set_with_ttl

log = structlog.get_logger()

_DAY_TTL = 25 * 3600        # 25h — covers the full calendar day with buffer
_TOTAL_TTL = 365 * 86400    # 1 year — effectively permanent for campaign lifetime


def _day_key(campaign_id: str, user_id: str) -> str:
    today = date.today().strftime("%Y%m%d")
    return f"pam:campaign:daily:{campaign_id}:{user_id}:{today}"


def _total_key(campaign_id: str, user_id: str) -> str:
    return f"pam:campaign:total:{campaign_id}:{user_id}"


def _min_delay_key(campaign_id: str, user_id: str) -> str:
    return f"pam:campaign:min_delay:{campaign_id}:{user_id}"


async def check_rate_limit(campaign: Campaign, user_id: str, redis: Redis) -> bool:
    """Return True if the send is permitted under this campaign's rate limits."""
    rl = campaign.rate_limit

    day_count_str = await get_str(redis, _day_key(campaign.campaign_id, user_id))
    day_count = int(day_count_str) if day_count_str else 0
    if day_count >= rl.per_user_per_day:
        return False

    if rl.per_user_per_campaign_total is not None:
        total_str = await get_str(redis, _total_key(campaign.campaign_id, user_id))
        total = int(total_str) if total_str else 0
        if total >= rl.per_user_per_campaign_total:
            return False

    return True


async def check_min_delay(campaign: Campaign, user_id: str, redis: Redis) -> bool:
    """Return True if enough time has passed since the last send to this user for this campaign."""
    if campaign.min_delay_between_sends_minutes is None:
        return True
    existing = await get_str(redis, _min_delay_key(campaign.campaign_id, user_id))
    return existing is None


async def mark_sent(campaign: Campaign, user_id: str, redis: Redis) -> None:
    """Increment rate limit counters and set min-delay marker after a send job is emitted."""
    await incr_with_expire(redis, _day_key(campaign.campaign_id, user_id), _DAY_TTL)

    if campaign.rate_limit.per_user_per_campaign_total is not None:
        await incr_with_expire(redis, _total_key(campaign.campaign_id, user_id), _TOTAL_TTL)

    if campaign.min_delay_between_sends_minutes is not None:
        ttl = campaign.min_delay_between_sends_minutes * 60
        await set_with_ttl(redis, _min_delay_key(campaign.campaign_id, user_id), "1", ttl)
