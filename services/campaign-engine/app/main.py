import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.admin import router as admin_router
from app.routes.campaigns import router as campaigns_router
from app.routes.dashboard import router as dashboard_router
from app.routes.reports import router as reports_router
from app.routes.settings import router as settings_router
from app.routes.templates import router as templates_router
from app.jobs import health_classifier
from app.triggers.event import run_consumer
from shared.clients.clickhouse import make_clickhouse_client
from shared.clients.kafka import make_kafka_producer
from shared.clients.mongo import create_campaign_indexes, make_mongo_client
from shared.clients.redis import make_redis_client
from shared.cors import CORS_ORIGINS
from shared.logging_config import configure_logging

configure_logging(debug=settings.debug, log_dir=settings.log_dir or None, log_level=settings.log_level)
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

    ch = await make_clickhouse_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        database=settings.clickhouse_database,
        username=settings.clickhouse_username,
        password=settings.clickhouse_password,
    )
    app.state.ch = ch

    producer = await make_kafka_producer(
        settings.kafka_bootstrap_servers,
        sasl_username=settings.kafka_sasl_username,
        sasl_password=settings.kafka_sasl_password,
    )
    app.state.producer = producer

    health_classifier.start(db, ch)

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

    health_classifier.stop()
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
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

route_prefix = "/api/v1/campaign"
app.include_router(admin_router, prefix=route_prefix)
app.include_router(templates_router, prefix=route_prefix)
app.include_router(reports_router, prefix=route_prefix)
app.include_router(campaigns_router, prefix=route_prefix)
app.include_router(dashboard_router, prefix=route_prefix)
app.include_router(settings_router, prefix=route_prefix)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "version": settings.version}
