import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app.config import settings
from app.models import Audience
from shared.clients.mongo import is_segment_member
from shared.clients.redis import get_str, set_with_ttl

log = structlog.get_logger()

_CACHE_MEMBER = "1"
_CACHE_NON_MEMBER = "0"


def _cache_key(project_id: str, segment_id: str, user_id: str) -> str:
    return f"pam:seg:{project_id}:{segment_id}:{user_id}"


async def is_in_audience(
    audience: Audience,
    project_id: str,
    user_id: str,
    db: AsyncIOMotorDatabase,
    redis: Redis,
) -> bool:
    if audience.all:
        return True

    if not audience.segment_id:
        # No restriction — treat as all users
        return True

    key = _cache_key(project_id, audience.segment_id, user_id)
    cached = await get_str(redis, key)

    if cached is not None:
        return cached == _CACHE_MEMBER

    member = await is_segment_member(db, project_id, audience.segment_id, user_id)
    value = _CACHE_MEMBER if member else _CACHE_NON_MEMBER
    await set_with_ttl(redis, key, value, settings.segment_cache_ttl_seconds)

    log.debug(
        "audience.cache_miss",
        project_id=project_id,
        segment_id=audience.segment_id,
        user_id=user_id,
        member=member,
    )
    return member
