from __future__ import annotations

import json

import structlog
from aiokafka import ConsumerRecord

log = structlog.get_logger()


async def process_bonus_batch(batch: list[ConsumerRecord]) -> None:
    """
    Called by KafkaConsumer for each committed batch.

    Offsets are committed only after this function returns without raising.
    Raise to prevent commit and force re-delivery on next restart.
    """
    for msg in batch:
        try:
            payload = json.loads(msg.value.decode())
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            log.warning(
                "bonus_msg_decode_failed",
                topic=msg.topic,
                partition=msg.partition,
                offset=msg.offset,
                error=str(exc),
            )
            continue

        log.info(
            "bonus_event_received",
            topic=msg.topic,
            partition=msg.partition,
            offset=msg.offset,
            event_type=payload.get("event_type"),
            user_id=payload.get("user_id"),
            project_id=payload.get("project_id"),
        )

        # TODO: dispatch to bonus processing logic here
