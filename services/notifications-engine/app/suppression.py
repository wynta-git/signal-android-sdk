from redis.asyncio import Redis


def _key(project_id: str, user_id: str, channel: str) -> str:
    return f"pam:suppress:{project_id}:{user_id}:{channel}"


async def is_suppressed(redis: Redis, project_id: str, user_id: str, channel: str) -> bool:
    """Channel-scoped: a user suppressed for one channel (e.g. an email hard
    bounce) is NOT suppressed for other channels (e.g. push)."""
    return await redis.exists(_key(project_id, user_id, channel)) == 1


async def suppressed_user_ids(
    redis: Redis, project_id: str, user_ids: list[str], channel: str
) -> set[str]:
    """Batch suppression check for a group of users — one Redis round-trip."""
    if not user_ids:
        return set()
    pipe = redis.pipeline()
    for user_id in user_ids:
        pipe.exists(_key(project_id, user_id, channel))
    results = await pipe.execute()
    return {uid for uid, exists in zip(user_ids, results) if exists}


async def suppress(
    redis: Redis, project_id: str, user_id: str, channel: str, reason: str
) -> None:
    """Set the hot-path Redis suppression key. Callers should also write the
    durable audit record via shared.clients.mongo.add_suppression."""
    await redis.set(_key(project_id, user_id, channel), reason)
