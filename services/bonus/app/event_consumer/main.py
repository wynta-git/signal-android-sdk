from __future__ import annotations

import asyncio
import signal

import structlog

from app.config import settings
from app.event_consumer.bonus_event_consumer import process_bonus_batch
from shared.clients.kafka import KafkaConsumer

log = structlog.get_logger()


async def main() -> None:
    log.info(
        "bonus_consumer_starting",
        topic=settings.kafka_topic,
        group=settings.kafka_group_id,
        bootstrap=settings.kafka_bootstrap_servers,
    )

    consumer = KafkaConsumer(
        topics=[settings.kafka_topic],
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_group_id,
        callback=process_bonus_batch,
        batch_size=settings.kafka_batch_size,
        batch_timeout_ms=settings.kafka_batch_timeout_ms,
        consumer_kwargs={
            # "security_protocol": settings.kafka_security_protocol,
            # "sasl_mechanism": settings.kafka_sasl_mechanism,
            # "sasl_plain_username": settings.kafka_sasl_username,
            # "sasl_plain_password": settings.kafka_sasl_password,
        },
    )

    await consumer.start()
    log.info("bonus_consumer_started")

    loop = asyncio.get_running_loop()

    def _on_signal(sig: signal.Signals) -> None:
        log.info("shutdown_signal_received", signal=sig.name)
        asyncio.create_task(consumer.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: _on_signal(s))

    try:
        await consumer.run()
    finally:
        await consumer.stop()
        log.info("bonus_consumer_stopped")


if __name__ == "__main__":
    asyncio.run(main())
