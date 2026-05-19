import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.kafka_producer import KafkaEventProducer
from shared.logging_config import configure_logging
from app.routes.admin import router as admin_router
from app.routes.alias import router as alias_router
from app.routes.identify import router as identify_router
from app.routes.ready import router as ready_router
from app.routes.track import router as track_router
from shared.clients.kafka import make_kafka_producer
from shared.clients.mongo import load_event_routes, make_mongo_client
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
    raw_producer = await make_kafka_producer(settings.kafka_bootstrap_servers)
    app.state.producer = KafkaEventProducer(raw_producer, settings.kafka_events_topic)

    routes = await load_event_routes(app.state.mongo[settings.mongo_db])
    unique_topics = {doc["topic"] for doc in routes}
    topic_producers: dict[str, KafkaEventProducer] = {}
    for topic in unique_topics:
        raw = await make_kafka_producer(settings.kafka_bootstrap_servers)
        topic_producers[topic] = KafkaEventProducer(raw, topic)
    app.state.topic_producers = topic_producers
    app.state.topic_producers_lock = asyncio.Lock()

    log.info("startup_complete", version=settings.version, fanout_topics=list(unique_topics))
    yield

    app.state.mongo.close()
    await app.state.redis.aclose()
    await raw_producer.stop()
    for producer in app.state.topic_producers.values():
        await producer.stop()
    log.info("shutdown_complete")


app = FastAPI(
    title="PAM API Service",
    version=settings.version,
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Client-Id"],
    expose_headers=["X-Request-Id"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next: object) -> Response:
    structlog.contextvars.clear_contextvars()
    request_id = str(uuid.uuid4())
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        client_id=request.headers.get("X-Client-Id"),
    )
    response: Response = await call_next(request)  # type: ignore[operator]
    response.headers["X-Request-Id"] = request_id
    return response


@app.middleware("http")
async def body_size_limit(request: Request, call_next: object) -> Response:
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_BYTES:
        return JSONResponse(
            status_code=400,
            content={"code": "payload_too_large", "message": "Request body exceeds 1MB"},
        )
    return await call_next(request)  # type: ignore[operator]


app.include_router(admin_router)
app.include_router(track_router)
app.include_router(identify_router)
app.include_router(alias_router)
app.include_router(ready_router)


@app.get("/v1/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.version}
