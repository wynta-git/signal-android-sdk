from redis.asyncio import Redis


async def is_suppressed(redis: Redis, project_id: str, user_id: str) -> bool:
    key = f"pam:suppress:{project_id}:{user_id}"
    return await redis.exists(key) == 1
