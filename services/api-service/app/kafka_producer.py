import asyncio
import json

import structlog
from aiokafka import AIOKafkaProducer

log = structlog.get_logger()


class KafkaEventProducer:
    def __init__(self, producer: AIOKafkaProducer, topic: str) -> None:
        self._producer = producer
        self._topic = topic

    async def _send(self, user_id: str, payload: dict) -> None:
        key = user_id.encode()
        value = json.dumps(payload).encode()
        await self._producer.send(self._topic, key=key, value=value)

    async def publish_events(self, events: list[dict]) -> None:
        for event in events:
            await self._send(event.get("user_id", ""), event)
        await self._producer.flush()
        log.debug("kafka_events_published", count=len(events), topic=self._topic)

    async def publish_identify(self, payload: dict) -> None:
        await self._send(payload.get("user_id", ""), payload)
        await self._producer.flush()

    async def publish_alias(self, payload: dict) -> None:
        await self._send(payload.get("user_id", ""), payload)
        await self._producer.flush()

    async def stop(self) -> None:
        await self._producer.stop()

    async def ping(self) -> None:
        # partitions_for fetches broker metadata — raises if broker is unreachable
        await self._producer.partitions_for(self._topic)


async def get_or_create_producer(
    producers: dict[str, "KafkaEventProducer"],
    lock: asyncio.Lock,
    topic: str,
    bootstrap_servers: str,
) -> "KafkaEventProducer":
    """Return existing producer for topic, or create one lazily (double-checked lock)."""
    producer = producers.get(topic)
    if producer is not None:
        return producer
    async with lock:
        producer = producers.get(topic)
        if producer is not None:
            return producer
        from shared.clients.kafka import make_kafka_producer
        raw = await make_kafka_producer(bootstrap_servers)
        producer = KafkaEventProducer(raw, topic)
        producers[topic] = producer
        log.info("fanout_producer_created", topic=topic)
        return producer
