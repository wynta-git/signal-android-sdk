import logging
import logging.handlers
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fastapi import Depends

from app.auth import verify_s2s_request
from app.db import close_pool, init_pool
from app.dependencies import get_portal_token_context
from app.routers.bonus_head import register_exception_handlers
from app.routers import bonus_head, bonus_subhead, bonus_configure, bonus_configure_code, bonus_release_trigger, bonus_eligibility, bonus_summary, bonus_spend, pam_user_bonus
from shared.clients.redis import make_redis_client
from shared.cors import CORS_ORIGINS


def _configure_logging() -> None:
    from app.config import settings

    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    handlers: list[logging.Handler] = [logging.StreamHandler()]

    if settings.log_dir:
        os.makedirs(settings.log_dir, exist_ok=True)
        log_path = os.path.join(settings.log_dir, "bonus-service.log")
        file_handler = logging.handlers.RotatingFileHandler(
            log_path,
            maxBytes=50 * 1024 * 1024,   # 50 MB per file
            backupCount=7,                # keep 7 rotated files
            encoding="utf-8",
        )
        handlers.append(file_handler)

    logging.basicConfig(level=level, handlers=handlers, force=True)


_configure_logging()

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
)

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    from app.config import settings
    log.info("bonus_service.starting")
    await init_pool()
    log.info("bonus_service.db_pool_ready")
    app.state.redis = make_redis_client(settings.redis_url)
    log.info("bonus_service.redis_ready")
    yield
    await app.state.redis.aclose()
    await close_pool()
    log.info("bonus_service.stopped")


app = FastAPI(
    title="Bonus Service",
    description="Configuration API for the bonus system — heads, subheads, and mechanics.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

route_prefix = "/api/v1/bonus"
_s2s = [Depends(verify_s2s_request)]
_portal = [Depends(get_portal_token_context)]

# Back-office routers — portal JWT auth (same RS256 tokens as segmentation-engine)
app.include_router(bonus_head.router,            prefix=route_prefix, dependencies=_portal)
app.include_router(bonus_subhead.router,         prefix=route_prefix, dependencies=_portal)
app.include_router(bonus_configure.router,       prefix=route_prefix, dependencies=_portal)
app.include_router(bonus_configure_code.router,  prefix=route_prefix, dependencies=_portal)
app.include_router(bonus_release_trigger.router, prefix=route_prefix, dependencies=_portal)
app.include_router(bonus_eligibility.router,     prefix=route_prefix, dependencies=_portal)
app.include_router(bonus_summary.router,         prefix=route_prefix, dependencies=_portal)
app.include_router(bonus_spend.router,           prefix=route_prefix, dependencies=_portal)

# PAM user bonus router — S2S auth required (called by game servers)
app.include_router(pam_user_bonus.router,          prefix=route_prefix, dependencies=_s2s)
register_exception_handlers(app)
bonus_subhead.register_exception_handlers(app)
bonus_release_trigger.register_exception_handlers(app)
bonus_eligibility.register_exception_handlers(app)
pam_user_bonus.register_exception_handlers(app)


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}
