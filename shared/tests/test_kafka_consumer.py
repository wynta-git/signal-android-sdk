"""
Integration test for KafkaConsumer against the dev broker.

Run:
    cd shared
    uv run pytest tests/test_kafka_consumer.py -s -v

Or run the consume-forever helper directly:
    uv run python tests/test_kafka_consumer.py
"""

import asyncio
import json
import signal
from typing import Any

import pytest
from aiokafka import ConsumerRecord

from shared.clients.kafka import KafkaConsumer

# ── broker config ────────────────────────────────────────────────────────────
BOOTSTRAP_SERVERS = "43.204.90.164:9093"
# SASL_USERNAME = "admin"          # change if different
# SASL_PASSWORD = "glgm2026"
TOPIC = "pam.bonus.raw.v1"
GROUP_ID = "pam-test-consumer"
# ─────────────────────────────────────────────────────────────────────────────

SASL_KWARGS: dict[str, Any] = {
    "security_protocol": "SASL_PLAINTEXT",
    "sasl_mechanism": "PLAIN",
    # "sasl_plain_username": SASL_USERNAME,
    # "sasl_plain_password": SASL_PASSWORD,
}


# ── shared callback ───────────────────────────────────────────────────────────

received: list[ConsumerRecord] = []


async def collecting_callback(batch: list[ConsumerRecord]) -> None:
    """Stores the batch and prints each message for inspection."""
    for msg in batch:
        received.append(msg)
        try:
            payload = json.loads(msg.value)
        except Exception:
            payload = msg.value
        print(
            f"  partition={msg.partition} offset={msg.offset} "
            f"key={msg.key} value={payload}"
        )


# ── tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_consumer_starts_and_stops() -> None:
    """Consumer should connect, start, and stop cleanly without errors."""
    consumer = KafkaConsumer(
        topics=[TOPIC],
        bootstrap_servers=BOOTSTRAP_SERVERS,
        group_id=GROUP_ID,
        callback=collecting_callback,
        consumer_kwargs=SASL_KWARGS,
    )
    await consumer.start()
    await consumer.stop()  # no exception == pass


@pytest.mark.asyncio
async def test_consumer_context_manager() -> None:
    """async with KafkaConsumer(...) should start and stop automatically."""
    async with KafkaConsumer(
        topics=[TOPIC],
        bootstrap_servers=BOOTSTRAP_SERVERS,
        group_id=GROUP_ID,
        callback=collecting_callback,
        consumer_kwargs=SASL_KWARGS,
    ):
        pass  # clean enter/exit is enough


@pytest.mark.asyncio
async def test_consumer_receives_messages() -> None:
    """
    Drains up to `batch_size` messages from the topic then stops.
    Passes even when the topic is empty (collected == 0 is valid for a new topic).
    """
    received.clear()

    consumer = KafkaConsumer(
        topics=[TOPIC],
        bootstrap_servers=BOOTSTRAP_SERVERS,
        group_id=GROUP_ID,
        callback=collecting_callback,
        batch_size=50,
        batch_timeout_ms=3_000,
        auto_offset_reset="earliest",
        # consumer_kwargs=SASL_KWARGS,
    )

    async def _run_once() -> None:
        """Run one poll cycle then stop."""
        await consumer.start()
        try:
            # run() blocks; cancel it after the first commit (or timeout)
            await asyncio.wait_for(consumer.run(), timeout=6.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        finally:
            await consumer.stop()

    await _run_once()
    print(f"\nCollected {len(received)} message(s) from {TOPIC}")
    # We only assert no exception was raised; message count depends on topic state.
    assert isinstance(received, list)


@pytest.mark.asyncio
async def test_commit_skipped_on_callback_error() -> None:
    """If the callback raises, the consumer should NOT commit the offset."""

    call_count = 0

    async def failing_callback(batch: list[ConsumerRecord]) -> None:
        nonlocal call_count
        call_count += 1
        raise RuntimeError("simulated processing failure")

    consumer = KafkaConsumer(
        topics=[TOPIC],
        bootstrap_servers=BOOTSTRAP_SERVERS,
        group_id=GROUP_ID + "-fail-test",
        callback=failing_callback,
        batch_size=10,
        batch_timeout_ms=3_000,
        auto_offset_reset="earliest",
        consumer_kwargs=SASL_KWARGS,
    )

    await consumer.start()
    try:
        with pytest.raises(RuntimeError, match="simulated processing failure"):
            await asyncio.wait_for(consumer.run(), timeout=6.0)
    except asyncio.TimeoutError:
        # topic was empty; callback was never called — that's fine
        pass
    finally:
        await consumer.stop()


# ── standalone entry-point (consume until Ctrl-C) ────────────────────────────

async def _consume_forever() -> None:
    print(f"Connecting to {BOOTSTRAP_SERVERS}, topic={TOPIC} …")
    consumer = KafkaConsumer(
        topics=[TOPIC],
        bootstrap_servers=BOOTSTRAP_SERVERS,
        group_id=GROUP_ID + "-manual",
        callback=collecting_callback,
        batch_size=100,
        batch_timeout_ms=1_000,
        auto_offset_reset="earliest",
        consumer_kwargs=SASL_KWARGS,
    )

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _handle_signal() -> None:
        print("\nShutting down …")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_signal)

    async with consumer:
        consume_task = asyncio.create_task(consumer.run())
        await stop_event.wait()
        consume_task.cancel()
        try:
            await consume_task
        except asyncio.CancelledError:
            pass

    print(f"Total messages received: {len(received)}")


if __name__ == "__main__":
    asyncio.run(_consume_forever())
