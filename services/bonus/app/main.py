from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI

from app.db import close_pool, init_pool
from app.routers.bonus_head import register_exception_handlers
from app.routers import bonus_head, bonus_subhead, bonus_configure

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

app.include_router(bonus_head.router)
app.include_router(bonus_subhead.router)
app.include_router(bonus_configure.router)
register_exception_handlers(app)


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}
