import json
import uuid

from fastapi import HTTPException, Request, status

from shared.auth.token import TokenContext

_IDEMPOTENCY_TTL = 21600  # 6 hours


def _cache_key(project_id: str, idempotency_key: str) -> str:
    return f"pam:idempotency:{project_id}:{idempotency_key}"


async def check_idempotency(request: Request, ctx: TokenContext) -> dict | None:
    raw_key = request.headers.get("X-Idempotency-Key")
    if not raw_key:
        return None

    try:
        parsed = uuid.UUID(raw_key)
        if parsed.version != 4:
            raise ValueError
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_idempotency_key", "message": "X-Idempotency-Key must be a UUID v4"},
        )

    cached = await request.app.state.redis.get(_cache_key(ctx.project_id, raw_key))
    if cached:
        return json.loads(cached)
    return None


async def store_idempotency(request: Request, ctx: TokenContext, response_data: dict) -> None:
    raw_key = request.headers.get("X-Idempotency-Key")
    if not raw_key:
        return
    await request.app.state.redis.set(
        _cache_key(ctx.project_id, raw_key),
        json.dumps(response_data),
        ex=_IDEMPOTENCY_TTL,
    )
