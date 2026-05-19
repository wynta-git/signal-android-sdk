from redis.asyncio import Redis

from app.models import Audience
from shared.clients.redis import is_segment_member


async def is_in_audience(
    audience: Audience,
    project_id: str,
    user_id: str,
    redis: Redis,
) -> bool:
    if audience.all:
        return True

    if not audience.segment_id:
        return True

    return await is_segment_member(redis, project_id, audience.segment_id, user_id)
