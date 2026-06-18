from __future__ import annotations

import asyncio
import logging
import logging.handlers
import os
import signal

import structlog

from app.config import settings
from app.db import close_pool, init_pool
from app.bonus_event_processor.consumer import run_consumer
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

log = structlog.get_logger()


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

    consumer_task = asyncio.create_task(run_consumer(redis))

    loop = asyncio.get_running_loop()

    def _on_signal(sig: signal.Signals) -> None:
        log.info("shutdown_signal_received", signal=sig.name)
        consumer_task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: _on_signal(s))

    try:
        await consumer_task
    except asyncio.CancelledError:
        log.info("bonus_consumer_stopped")
    finally:
        await close_pool()
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
