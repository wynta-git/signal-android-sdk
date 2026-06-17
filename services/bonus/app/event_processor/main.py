from __future__ import annotations

import asyncio
import signal

import structlog

from app.config import settings
from app.db import close_pool, init_pool
from app.event_processor.consumer import run_consumer
from shared.clients.redis import make_redis_client

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
