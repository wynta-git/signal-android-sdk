import asyncio
import signal
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.config import settings
from shared.logging_config import configure_logging
from app.refresh import scheduled
from app.refresh.event_driven import run_consumer
from app.routes.segments import router as segments_router
from shared.clients.clickhouse import make_clickhouse_client
from shared.clients.mongo import make_mongo_client
from shared.clients.redis import make_redis_client

configure_logging(debug=settings.debug)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("segmentation_engine.starting", version=settings.version)

    mongo_client = make_mongo_client(settings.mongo_url)
    db = mongo_client[settings.mongo_database]
    app.state.db = db

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

    await scheduled.start(db, ch, redis)

    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(run_consumer(db, ch, redis, stop_event))

    loop = asyncio.get_running_loop()

    def _on_signal(sig: signal.Signals) -> None:
        log.info("shutdown_signal_received", signal=sig.name)
        stop_event.set()
        consumer_task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: _on_signal(s))

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
app.include_router(segments_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
