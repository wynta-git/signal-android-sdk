import asyncio

import structlog
from shared.clients.kafka import make_kafka_producer
from shared.clients.mongo import (
    create_notification_delivery_indexes,
    create_notification_inbox_indexes,
    make_mongo_client,
)
from shared.clients.redis import make_redis_client
from shared.logging_config import configure_logging

from app.config import settings
from app.consumer import consumer_loop

configure_logging(debug=settings.debug, log_dir=settings.log_dir or None, log_level=settings.log_level)
log = structlog.get_logger()


async def _health_server(stop_event: asyncio.Event) -> None:
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        await reader.read(1024)
        body = b'{"status":"ok"}'
        response = (
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: application/json\r\n"
            b"Access-Control-Allow-Origin: *\r\n"
            b"Access-Control-Allow-Methods: GET, OPTIONS\r\n"
            b"Content-Length: " + str(len(body)).encode() + b"\r\n"
            b"\r\n" + body
        )
        writer.write(response)
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "0.0.0.0", settings.health_port)
    async with server:
        await stop_event.wait()


async def main() -> None:
    log.info("notifications_engine.starting", version=settings.version)

    mongo_client = make_mongo_client(settings.mongo_url)
    db = mongo_client[settings.mongo_database]
    await create_notification_delivery_indexes(db)
    await create_notification_inbox_indexes(db)

    redis = make_redis_client(settings.redis_url)
    producer = await make_kafka_producer(settings.kafka_bootstrap_servers)

    stop_event = asyncio.Event()

    tasks = [
        asyncio.create_task(consumer_loop(db, redis, producer, stop_event)),
        asyncio.create_task(_health_server(stop_event)),
    ]

    log.info("notifications_engine.started")

    try:
        await asyncio.gather(*tasks)
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        stop_event.set()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await producer.stop()
        await redis.aclose()
        mongo_client.close()
        log.info("notifications_engine.stopped")


if __name__ == "__main__":
    asyncio.run(main())
