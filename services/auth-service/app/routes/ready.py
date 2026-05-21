import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import settings

router = APIRouter()
log = structlog.get_logger()


@router.get("/v1/ready", include_in_schema=False)
async def ready(request: Request) -> JSONResponse:
    checks: dict[str, str] = {}

    try:
        await request.app.state.mongo.admin.command("ping")
        checks["mongo"] = "ok"
    except Exception:
        log.warning("readiness_check_failed", component="mongo")
        checks["mongo"] = "unreachable"

    all_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": "ok" if all_ok else "degraded",
            "version": settings.version,
            "checks": checks,
        },
    )
