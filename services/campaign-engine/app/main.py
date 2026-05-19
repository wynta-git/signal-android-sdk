import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.admin import router as admin_router
from app.routes.campaigns import router as campaigns_router
from app.routes.templates import router as templates_router
from app.triggers import scheduled as scheduler
from app.triggers.event import run_consumer
from shared.clients.kafka import make_kafka_producer
from shared.clients.mongo import create_campaign_indexes, make_mongo_client
from shared.clients.redis import make_redis_client
from shared.logging_config import configure_logging

configure_logging(debug=settings.debug)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("campaign_engine.starting", version=settings.version)

    mongo_client = make_mongo_client(settings.mongo_url)
    db = mongo_client[settings.mongo_database]
    app.state.db = db

    await create_campaign_indexes(db)

    redis = make_redis_client(settings.redis_url)
    app.state.redis = redis

    producer = await make_kafka_producer(settings.kafka_bootstrap_servers)
    app.state.producer = producer

    await scheduler.start(db, redis, producer)

    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(run_consumer(db, redis, producer, stop_event))

    log.info("campaign_engine.started")
    yield

    stop_event.set()
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass

    scheduler.stop()
    await producer.stop()
    await redis.aclose()
    mongo_client.close()
    log.info("campaign_engine.stopped")


app = FastAPI(
    title="campaign-engine",
    version=settings.version,
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(campaigns_router)
app.include_router(templates_router)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "version": settings.version}
