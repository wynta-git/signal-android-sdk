from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fastapi import Depends

from app.auth import verify_s2s_request
from app.db import close_pool, init_pool
from app.routers.bonus_head import register_exception_handlers
from app.routers import bonus_head, bonus_subhead, bonus_configure, bonus_release_trigger, bonus_eligibility, brands, bonus_summary, users, player_bonus

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
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000","http://127.0.0.1:8081"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_V1 = "/api/v1/bonus"
_s2s = [Depends(verify_s2s_request)]

# Back-office routers — no S2S auth required
app.include_router(bonus_head.router,            prefix=_V1)
app.include_router(bonus_subhead.router,         prefix=_V1)
app.include_router(bonus_configure.router,       prefix=_V1)
app.include_router(bonus_release_trigger.router, prefix=_V1)
app.include_router(bonus_eligibility.router,     prefix=_V1)
app.include_router(brands.router,                prefix=_V1)
app.include_router(bonus_summary.router,         prefix=_V1)
app.include_router(users.router,                 prefix=_V1)

# Player bonus router — S2S auth required (called by game servers)
app.include_router(player_bonus.router,          prefix=_V1, dependencies=_s2s)
register_exception_handlers(app)
bonus_release_trigger.register_exception_handlers(app)
bonus_eligibility.register_exception_handlers(app)
player_bonus.register_exception_handlers(app)


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}
