import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from app.config import settings
from app.forwarder import EventForwarder
from app.logging_config import configure_logging
from app.routes.alias import router as alias_router
from app.routes.identify import router as identify_router
from app.routes.ready import router as ready_router
from app.routes.track import router as track_router
from shared.clients.mongo import make_mongo_client
from shared.clients.redis import make_redis_client

configure_logging(debug=settings.debug)
log = structlog.get_logger()

MAX_BODY_BYTES = 1 * 1024 * 1024  # 1 MB


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.mongo = make_mongo_client(
        settings.mongo_url,
        min_pool_size=settings.mongo_min_pool_size,
        max_pool_size=settings.mongo_max_pool_size,
    )
    app.state.redis = make_redis_client(
        settings.redis_url,
        max_connections=settings.redis_max_connections,
    )
    app.state.forwarder = EventForwarder(settings.event_handler_url)
    log.info("startup_complete", version=settings.version)
    yield
    app.state.mongo.close()
    await app.state.redis.aclose()
    await app.state.forwarder.aclose()
    log.info("shutdown_complete")


app = FastAPI(
    title="PAM API Service",
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


@app.middleware("http")
async def body_size_limit(request: Request, call_next: object) -> Response:
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_BYTES:
        return JSONResponse(
            status_code=400,
            content={"code": "payload_too_large", "message": "Request body exceeds 1MB"},
        )
    return await call_next(request)  # type: ignore[operator]


app.include_router(track_router)
app.include_router(identify_router)
app.include_router(alias_router)
app.include_router(ready_router)


@app.get("/v1/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.version}
