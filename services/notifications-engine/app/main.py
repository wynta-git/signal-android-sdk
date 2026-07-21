import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from shared.clients.kafka import make_kafka_producer
from shared.clients.mongo import (
    create_notification_delivery_indexes,
    create_notification_inbox_indexes,
    create_suppression_indexes,
    make_mongo_client,
)
from shared.clients.redis import make_redis_client
from shared.logging_config import configure_logging

from app.callbacks import router as callbacks_router
from app.config import settings
from app.consumer import consumer_loop
from app.grouped_email_consumer import grouped_email_consumer_loop

configure_logging(debug=settings.debug, log_dir=settings.log_dir or None, log_level=settings.log_level)
log = structlog.get_logger()


async def _supervised(
    name: str, coro_factory: Callable[[], Awaitable[None]], stop_event: asyncio.Event
) -> None:
    """
    Restarts `coro_factory()` (a one-shot consumer_loop invocation) if it
    raises, instead of letting the exception die silently inside an
    unobserved asyncio.Task. consumer_loop/grouped_email_consumer_loop are
    written to re-raise on a fatal Kafka error (e.g. a heartbeat/session
    failure) on the assumption that something restarts them — without this
    supervisor, that assumption was never true and a transient rebalance
    failure would permanently kill that consumer for the life of the process.
    """
    while not stop_event.is_set():
        try:
            await coro_factory()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception(f"{name}.crashed_restarting")
            if stop_event.is_set():
                break
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("notifications_engine.starting", version=settings.version)

    mongo_client = make_mongo_client(settings.mongo_url)
    db = mongo_client[settings.mongo_database]
    app.state.db = db

    await create_notification_delivery_indexes(db)
    await create_notification_inbox_indexes(db)
    await create_suppression_indexes(db)

    redis = make_redis_client(settings.redis_url)
    app.state.redis = redis

    producer = await make_kafka_producer(
        settings.kafka_bootstrap_servers,
        sasl_username=settings.kafka_sasl_username,
        sasl_password=settings.kafka_sasl_password,
    )
    app.state.producer = producer

    stop_event = asyncio.Event()
    # Two independent consumer tasks: the existing push/in_app consumer is
    # completely untouched by adding the second one — different topic,
    # different consumer group, different fetch-batch tuning, so email
    # traffic can never affect push/in_app latency or throughput.
    consumer_task = asyncio.create_task(
        _supervised(
            "consumer_loop",
            lambda: consumer_loop(db, redis, producer, stop_event),
            stop_event,
        )
    )
    grouped_email_task = asyncio.create_task(
        _supervised(
            "grouped_email_consumer_loop",
            lambda: grouped_email_consumer_loop(db, redis, producer, stop_event),
            stop_event,
        )
    )

    log.info("notifications_engine.started")
    yield

    stop_event.set()
    consumer_task.cancel()
    grouped_email_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await consumer_task
    with contextlib.suppress(asyncio.CancelledError):
        await grouped_email_task

    await producer.stop()
    await redis.aclose()
    mongo_client.close()
    log.info("notifications_engine.stopped")


app = FastAPI(
    title="notifications-engine",
    version=settings.version,
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)

app.include_router(callbacks_router, prefix="/v1/email")


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "version": settings.version}
