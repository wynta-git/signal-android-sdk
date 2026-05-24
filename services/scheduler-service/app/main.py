import asyncio

import structlog
from aiokafka import AIOKafkaProducer

from app.config import settings
from app.executor import executor_loop
from app.poller import poll_loop
from app.recovery import recovery_loop
from shared.clients.kafka import make_kafka_producer
from shared.clients.mongo import create_campaign_indexes, make_mongo_client
from shared.clients.redis import make_redis_client
from shared.logging_config import configure_logging

configure_logging(debug=settings.debug)
log = structlog.get_logger()


async def _health_server(stop_event: asyncio.Event) -> None:
    """Minimal HTTP /health endpoint using raw asyncio — no FastAPI overhead."""
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        await reader.read(1024)
        body = b'{"status":"ok"}'
        response = (
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: application/json\r\n"
            b"Content-Length: " + str(len(body)).encode() + b"\r\n"
            b"\r\n" + body
        )
        writer.write(response)
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "0.0.0.0", 8080)
    async with server:
        await stop_event.wait()


async def main() -> None:
    log.info("scheduler_service.starting", version=settings.version)

    mongo_client = make_mongo_client(settings.mongo_url)
    db = mongo_client[settings.mongo_database]
    await create_campaign_indexes(db)

    redis = make_redis_client(settings.redis_url)

    send_producer: AIOKafkaProducer = await make_kafka_producer(settings.kafka_bootstrap_servers)
    dlq_producer: AIOKafkaProducer = await make_kafka_producer(settings.kafka_bootstrap_servers)
    # Scheduler topic producer (used by poller)
    scheduler_producer: AIOKafkaProducer = await make_kafka_producer(
        settings.kafka_bootstrap_servers
    )

    stop_event = asyncio.Event()

    tasks = [
        asyncio.create_task(poll_loop(db, scheduler_producer, stop_event)),
        asyncio.create_task(recovery_loop(db, stop_event)),
        asyncio.create_task(executor_loop(db, redis, send_producer, dlq_producer, stop_event)),
        asyncio.create_task(_health_server(stop_event)),
    ]

    log.info("scheduler_service.started")

    try:
        await asyncio.gather(*tasks)
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        stop_event.set()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

        await send_producer.stop()
        await dlq_producer.stop()
        await scheduler_producer.stop()
        await redis.aclose()
        mongo_client.close()
        log.info("scheduler_service.stopped")


if __name__ == "__main__":
    asyncio.run(main())
