import json

import structlog
from redis.asyncio import Redis

log = structlog.get_logger()

_KEY_PREFIX = "seg"


def _user_key(project_id: str, user_id: str) -> str:
    return f"{_KEY_PREFIX}:{project_id}:{user_id}"


async def get_user_segments(
    redis: Redis, project_id: str, user_id: str
) -> list[str] | None:
    raw = await redis.get(_user_key(project_id, user_id))
    if raw is None:
        return None
    return json.loads(raw)


async def set_user_segments(
    redis: Redis,
    project_id: str,
    user_id: str,
    segment_ids: list[str],
    ttl: int,
) -> None:
    await redis.set(_user_key(project_id, user_id), json.dumps(segment_ids), ex=ttl)


async def invalidate_user(redis: Redis, project_id: str, user_id: str) -> None:
    await redis.delete(_user_key(project_id, user_id))


async def invalidate_segment(
    redis: Redis, project_id: str, segment_id: str, user_ids: set[str]
) -> None:
    """Invalidate cache entries for all users that were in this segment."""
    if not user_ids:
        return
    keys = [_user_key(project_id, uid) for uid in user_ids]
    await redis.delete(*keys)
    log.info(
        "cache.invalidated",
        project_id=project_id,
        segment_id=segment_id,
        count=len(keys),
    )
