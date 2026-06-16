import asyncio
import signal

import structlog

from app.alias_manager import AliasManager
from app.config import settings
from app.consumer import run_consumer
from shared.logging_config import configure_logging
from app.profile_updater import ProfileUpdater
from app.schema_manager import SchemaManager
from app.writer import ClickHouseWriter
from shared.clients.clickhouse import make_clickhouse_client
from shared.clients.mongo import make_mongo_client
from shared.clients.redis import make_redis_client

configure_logging(debug=settings.debug)
log = structlog.get_logger()


async def main() -> None:
    log.info("event_processor_starting", version=settings.version)

    ch_client = await make_clickhouse_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        database=settings.clickhouse_database,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )
    log.info(
        "clickhouse_connected",
        host=settings.clickhouse_host,
        database=settings.clickhouse_database,
    )

    redis_client = make_redis_client(settings.redis_url)
    log.info("redis_connected", url=settings.redis_url)

    mongo_client = make_mongo_client(settings.mongo_url)
    db = mongo_client[settings.mongo_db]
    log.info("mongo_connected", url=settings.mongo_url, db=settings.mongo_db)

    schema_mgr = SchemaManager(redis=redis_client, ch_client=ch_client, db=db)
    alias_mgr = AliasManager(db)
    profile_updater = ProfileUpdater(db)
    writer = ClickHouseWriter(ch_client, schema_mgr, redis=redis_client, alias_mgr=alias_mgr, profile_updater=profile_updater)
    consumer_task = asyncio.create_task(run_consumer(writer))

    loop = asyncio.get_running_loop()

    def _on_signal(sig: signal.Signals) -> None:
        log.info("shutdown_signal_received", signal=sig.name)
        consumer_task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: _on_signal(s))

    try:
        await consumer_task
    except asyncio.CancelledError:
        log.info("event_processor_stopped")
    finally:
        await ch_client.close()
        await redis_client.aclose()
        mongo_client.close()


if __name__ == "__main__":
    asyncio.run(main())
