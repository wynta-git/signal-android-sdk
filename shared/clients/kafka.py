from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer, ConsumerRecord


async def make_kafka_producer(
    bootstrap_servers: str,
    *,
    acks: str | int = "all",
    compression_type: str = "gzip",
) -> AIOKafkaProducer:
    producer = AIOKafkaProducer(
        bootstrap_servers=bootstrap_servers,
        acks=acks,
        compression_type=compression_type,
    )
    await producer.start()
    return producer


# Callback receives the full batch; raises on unrecoverable error, returns normally on success.
BatchCallback = Callable[[list[ConsumerRecord]], Awaitable[None]]


class KafkaConsumer:
    """
    Generic manual-commit consumer.

    Fetches a batch of messages, hands them to `callback`, and only commits
    the batch offset once the callback returns without raising.  If the
    callback raises, the batch is NOT committed so the messages will be
    re-delivered after a restart.
    """

    def __init__(
        self,
        topics: list[str],
        bootstrap_servers: str,
        group_id: str,
        callback: BatchCallback,
        *,
        batch_size: int = 100,
        batch_timeout_ms: int = 1_000,
        auto_offset_reset: str = "earliest",
        consumer_kwargs: dict[str, Any] | None = None,
    ) -> None:
        self._topics = topics
        self._bootstrap_servers = bootstrap_servers
        self._group_id = group_id
        self._callback = callback
        self._batch_size = batch_size
        self._batch_timeout_ms = batch_timeout_ms
        self._auto_offset_reset = auto_offset_reset
        self._consumer_kwargs = consumer_kwargs or {}
        self._consumer: AIOKafkaConsumer | None = None
        self._running = False

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            *self._topics,
            bootstrap_servers=self._bootstrap_servers,
            group_id=self._group_id,
            enable_auto_commit=False,
            auto_offset_reset=self._auto_offset_reset,
            **self._consumer_kwargs,
        )
        await self._consumer.start()
        self._running = True

    async def stop(self) -> None:
        self._running = False
        if self._consumer is not None:
            await self._consumer.stop()

    async def run(self) -> None:
        """
        Main consume loop.  Call after `start()`.  Blocks until `stop()` is called.
        Commit happens only after the callback succeeds for the whole batch.
        """
        if self._consumer is None:
            raise RuntimeError("Call start() before run()")

        while self._running:
            records: dict[Any, list[ConsumerRecord]] = (
                await self._consumer.getmany(
                    max_records=self._batch_size,
                    timeout_ms=self._batch_timeout_ms,
                )
            )
            if not records:
                continue

            batch: list[ConsumerRecord] = [
                msg for msgs in records.values() for msg in msgs
            ]

            await self._callback(batch)

            # Only reached when callback returns without raising.
            await self._consumer.commit()

    async def __aenter__(self) -> "KafkaConsumer":
        await self.start()
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.stop()
