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

    async def ping(self) -> None:
        # partitions_for fetches broker metadata — raises if broker is unreachable
        await self._producer.partitions_for(self._topic)
