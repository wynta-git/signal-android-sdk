import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request, Response

from app.config import settings
from app.routes.ready import router as ready_router
from app.routes.token import router as token_router
from shared.clients.mongo import make_mongo_client
from shared.logging_config import configure_logging

configure_logging(debug=settings.debug)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.mongo = make_mongo_client(
        settings.mongo_url,
        min_pool_size=settings.mongo_min_pool_size,
        max_pool_size=settings.mongo_max_pool_size,
    )
    log.info("startup_complete", version=settings.version)
    yield
    app.state.mongo.close()
    log.info("shutdown_complete")


app = FastAPI(
    title="PAM Auth Service",
    version=settings.version,
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next: object) -> Response:
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=str(uuid.uuid4()))
    return await call_next(request)  # type: ignore[operator]


app.include_router(token_router)
app.include_router(ready_router)


@app.get("/api/v1/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.version}
