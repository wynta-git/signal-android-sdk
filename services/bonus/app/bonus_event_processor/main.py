from __future__ import annotations

import asyncio
import logging
import logging.handlers
import os
import signal

import structlog
from redis.asyncio import Redis

from app.config import settings
from app.db import close_pool, init_pool
from app.bonus_event_processor.consumer import run_consumer
from app.bonus_event_processor.manual_bonus_consumer import run_manual_bonus_consumer
from app.bonus_event_processor.chunk_expiry_job import run_chunk_expiry_job
from app.bonus_event_processor.bonus_forfeit_job import run_bonus_forfeit_job
from shared.clients.redis import make_redis_client


def _configure_logging() -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    handlers: list[logging.Handler] = [logging.StreamHandler()]

    if settings.log_dir:
        os.makedirs(settings.log_dir, exist_ok=True)
        log_path = os.path.join(settings.log_dir, "bonus-consumer.log")
        file_handler = logging.handlers.RotatingFileHandler(
            log_path,
            maxBytes=50 * 1024 * 1024,
            backupCount=7,
            encoding="utf-8",
        )
        handlers.append(file_handler)

    logging.basicConfig(level=level, handlers=handlers, force=True)

    # aiokafka is extremely noisy at DEBUG — cap it at WARNING
    logging.getLogger("aiokafka").setLevel(logging.WARNING)
    logging.getLogger("kafka").setLevel(logging.WARNING)


_configure_logging()

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
)

log = structlog.get_logger()


async def _run_scheduler(stop_event: asyncio.Event, redis: Redis) -> None:
    log.info(
        "bonus_scheduler.starting",
        interval_minutes=settings.scheduler_interval_minutes,
        batch_size=settings.scheduler_batch_size,
    )
    while not stop_event.is_set():
        try:
            await asyncio.gather(
                run_chunk_expiry_job(settings.scheduler_batch_size, redis),
                run_bonus_forfeit_job(settings.scheduler_batch_size, redis),
            )
        except Exception:
            log.exception("bonus_scheduler.job_error")

        interval_s = settings.scheduler_interval_minutes * 60
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_s)
        except asyncio.TimeoutError:
            pass
    log.info("bonus_scheduler.stopped")


async def main() -> None:
    log.info(
        "bonus_consumer_starting",
        topic=settings.kafka_topic,
        group=settings.kafka_group_id,
        bootstrap=settings.kafka_bootstrap_servers,
    )

    await init_pool()
    log.info("bonus_consumer_db_pool_ready")

    redis = make_redis_client(settings.redis_url)
    log.info("bonus_consumer_redis_ready", url=settings.redis_url)

    stop_event            = asyncio.Event()
    consumer_task         = asyncio.create_task(run_consumer(redis))
    manual_bonus_task     = asyncio.create_task(run_manual_bonus_consumer(redis))
    scheduler_task        = asyncio.create_task(_run_scheduler(stop_event, redis))

    loop = asyncio.get_running_loop()

    def _on_signal(sig: signal.Signals) -> None:
        log.info("shutdown_signal_received", signal=sig.name)
        consumer_task.cancel()
        manual_bonus_task.cancel()
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: _on_signal(s))

    try:
        await asyncio.gather(consumer_task, manual_bonus_task, scheduler_task, return_exceptions=True)
    except asyncio.CancelledError:
        log.info("bonus_consumer_stopped")
    finally:
        await close_pool()
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
