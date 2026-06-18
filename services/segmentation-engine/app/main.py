import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from shared.logging_config import configure_logging
from app import storage
from app.refresh import scheduled
from app.refresh.event_driven import run_consumer
from app.routes.admin import router as admin_router
from app.routes.segments import router as segments_router
from app.routes.meta import router as meta_router
from app.services.meta import MetaService
from shared.clients.clickhouse import make_clickhouse_client
from shared.clients.mongo import make_mongo_client
from shared.clients.redis import make_redis_client
from shared.cors import CORS_ORIGINS

configure_logging(debug=settings.debug, log_dir=settings.log_dir or None, log_level=settings.log_level)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("segmentation_engine.starting", version=settings.version)

    mongo_client = make_mongo_client(settings.mongo_url)
    db = mongo_client[settings.mongo_database]
    app.state.db = db

    await storage.create_indexes(db)

    ch = await make_clickhouse_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        database=settings.clickhouse_database,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )
    app.state.ch = ch

    redis = make_redis_client(settings.redis_url)
    app.state.redis = redis

    app.state.meta = MetaService()

    await scheduled.start(db, ch, redis)

    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(run_consumer(db, ch, redis, stop_event))

    log.info("segmentation_engine.started")
    yield

    stop_event.set()
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass

    scheduled.stop()
    ch.close()
    await redis.aclose()
    mongo_client.close()
    log.info("segmentation_engine.stopped")


app = FastAPI(title="segmentation-engine", version=settings.version, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
route_prefix = "/api/v1/segment"
app.include_router(admin_router, prefix=route_prefix)
app.include_router(segments_router,prefix=route_prefix)
app.include_router(meta_router,prefix=route_prefix)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
