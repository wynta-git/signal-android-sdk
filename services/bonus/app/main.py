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
from app.routers import bonus_head, bonus_subhead, bonus_configure, bonus_configure_code, bonus_release_trigger, bonus_eligibility, bonus_summary, player_bonus
from shared.cors import CORS_ORIGINS

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    log.info("bonus_service.starting")
    await init_pool()
    log.info("bonus_service.db_pool_ready")
    yield
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

# Player bonus router — S2S auth required (called by game servers)
app.include_router(player_bonus.router,          prefix="/api/v1",    dependencies=_s2s)
register_exception_handlers(app)
bonus_subhead.register_exception_handlers(app)
bonus_release_trigger.register_exception_handlers(app)
bonus_eligibility.register_exception_handlers(app)
player_bonus.register_exception_handlers(app)


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}
