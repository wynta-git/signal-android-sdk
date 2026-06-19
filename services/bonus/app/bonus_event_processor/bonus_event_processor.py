from __future__ import annotations

import json

import structlog
from aiokafka import ConsumerRecord
from redis.asyncio import Redis

from app.bonus_event_processor.eligibility_checker import check_eligibility
from app.bonus_event_processor.grant_writer import (
    check_applicability,
    check_occurrence,
    compute_grant_amount,
    write_grant,
)
from app.bonus_event_processor.trigger_cache import get_triggers
from shared.clients.mysql import POOL_BONUS, get_connection
from shared.services.user import get_or_create_pam_user

log = structlog.get_logger()

_redis: Redis | None = None


def set_redis(r: Redis) -> None:
    global _redis
    _redis = r


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

        event_name = payload.get("event_name") or payload.get("event_type")
        user_id = payload.get("user_id")
        project_id = payload.get("project_id")

        log.info(
            "bonus_event_received",
            topic=msg.topic,
            partition=msg.partition,
            offset=msg.offset,
            event_name=event_name,
            user_id=user_id,
            project_id=project_id,
        )

        try:
            site_id = int(project_id)
        except (TypeError, ValueError):
            log.warning(
                "bonus_event_invalid_site_id",
                project_id=project_id,
                event_name=event_name,
                user_id=user_id,
            )
            continue

        if not event_name or not user_id:
            log.warning(
                "bonus_event_missing_fields",
                event_name=event_name,
                user_id=user_id,
                site_id=site_id,
            )
            continue

        if _redis is None:
            log.error("bonus_consumer_redis_not_initialized")
            raise RuntimeError("Redis client not initialised — call set_redis() at startup")

        pam_user_id = await get_or_create_pam_user(_redis, site_id, user_id)

        try:
            triggers = await get_triggers(_redis, site_id, event_name)
        except Exception as exc:
            log.error("bonus_trigger_lookup_failed", site_id=site_id, event_name=event_name, error=str(exc))
            raise

        if not triggers:
            continue

        props: dict = payload.get("properties") or {}
        trigger_amount_raw = props.get("amount")
        trigger_amount = float(trigger_amount_raw) if trigger_amount_raw is not None else None
        event_product = props.get("product")
        event_payment_method = props.get("payment_method")

        try:
            async with get_connection(POOL_BONUS) as conn:
                for t in triggers:
                    cfg = t["configure"]

                    # Amount range check
                    min_amt = t.get("min_trigger_amount")
                    max_amt = t.get("max_trigger_amount")
                    if min_amt is not None and (trigger_amount is None or trigger_amount < min_amt):
                        continue
                    if max_amt is not None and (trigger_amount is None or trigger_amount > max_amt):
                        continue

                    # Product check
                    trigger_product = t.get("product")
                    if trigger_product and trigger_product != event_product:
                        continue

                    # Payment method check (stored as comma-separated list)
                    trigger_pm = t.get("payment_method")
                    if trigger_pm and event_payment_method not in trigger_pm.split(","):
                        continue

                    async with conn.cursor() as cur:
                        if not await check_occurrence(cur, pam_user_id, cfg["id"], t["occurrence"]):
                            log.info(
                                "bonus_skipped_occurrence",
                                user_id=user_id,
                                pam_user_id=pam_user_id,
                                configure_id=cfg["id"],
                                occurrence=t["occurrence"],
                            )
                            continue

                        if not await check_applicability(
                            cur, pam_user_id, cfg["id"], cfg["applicability_frequency"]
                        ):
                            log.info(
                                "bonus_skipped_applicability",
                                user_id=user_id,
                                pam_user_id=pam_user_id,
                                configure_id=cfg["id"],
                                freq=cfg["applicability_frequency"],
                            )
                            continue

                    if not await check_eligibility(_redis, cfg["id"], props):
                        log.info(
                            "bonus_skipped_eligibility",
                            user_id=user_id,
                            configure_id=cfg["id"],
                        )
                        continue

                    grant_amount = compute_grant_amount(cfg, trigger_amount)
                    if grant_amount <= 0:
                        continue

                    grant_id = await write_grant(conn, t, cfg, pam_user_id, site_id, grant_amount)
                    log.info(
                        "bonus_granted",
                        grant_id=grant_id,
                        configure_id=cfg["id"],
                        user_id=user_id,
                        pam_user_id=pam_user_id,
                        site_id=site_id,
                        event_name=event_name,
                        grant_amount=str(grant_amount),
                    )
        except Exception as exc:
            log.error(
                "bonus_grant_failed",
                site_id=site_id,
                event_name=event_name,
                user_id=user_id,
                error=str(exc),
            )
            raise
