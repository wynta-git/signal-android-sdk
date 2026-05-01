import time

import structlog
from fastapi import Depends, HTTPException, Request
from redis.asyncio import Redis

from app.auth.token import TokenContext
from app.dependencies import get_token_context

log = structlog.get_logger()

# Defaults — overridable per project via projects.settings.rate_limits in MongoDB
PROJECT_LIMIT_PER_MIN: int = 1000
USER_LIMIT_PER_MIN: int = 100


def _epoch_min() -> int:
    return int(time.time() // 60)


async def _incr_and_check(redis: Redis, key: str, limit: int) -> None:
    # Pipeline batches INCR + EXPIRE in one roundtrip so the key always gets a TTL.
    async with redis.pipeline(transaction=False) as pipe:
        await pipe.incr(key)
        await pipe.expire(key, 60)
        results = await pipe.execute()

    count: int = results[0]
    if count > limit:
        log.warning("rate_limit_exceeded", key=key, count=count, limit=limit)
        raise HTTPException(
            status_code=429,
            detail={"code": "rate_limited", "message": "Too many requests"},
        )


async def project_rate_limit(
    request: Request,
    ctx: TokenContext = Depends(get_token_context),
) -> TokenContext:
    """FastAPI dependency — checks per-project request rate after auth."""
    key = f"pam:rate:proj:{ctx.project_id}:min:{_epoch_min()}"
    await _incr_and_check(request.app.state.redis, key, PROJECT_LIMIT_PER_MIN)
    return ctx


async def user_rate_limit(project_id: str, user_id: str, redis: Redis) -> None:
    """Utility called directly from route handlers where user_id is known."""
    key = f"pam:rate:user:{project_id}:{user_id}:min:{_epoch_min()}"
    await _incr_and_check(redis, key, USER_LIMIT_PER_MIN)
