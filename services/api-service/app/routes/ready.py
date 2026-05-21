import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import settings
from shared.clients.redis import ping_redis

router = APIRouter()
log = structlog.get_logger()


@router.get("/v1/events/ready", include_in_schema=False)
async def ready(request: Request) -> JSONResponse:
    checks: dict[str, str] = {}

    try:
        await ping_redis(request.app.state.redis)
        checks["redis"] = "ok"
    except Exception:
        log.warning("readiness_check_failed", component="redis")
        checks["redis"] = "unreachable"

    try:
        await request.app.state.producer.ping()
        checks["kafka"] = "ok"
    except Exception:
        log.warning("readiness_check_failed", component="kafka")
        checks["kafka"] = "unreachable"

    all_ok = all(v == "ok" for v in checks.values())

    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": "ok" if all_ok else "degraded",
            "version": settings.version,
            "checks": checks,
        },
    )
