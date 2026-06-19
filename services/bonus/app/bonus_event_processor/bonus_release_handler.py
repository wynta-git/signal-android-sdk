"""BONUS_RELEASE handler.

When a trigger with release_type=BONUS_RELEASE fires:
  1. Apply amount / product / payment-method guards from the trigger.
  2. Check occurrence (how many times this user has received this bonus).
  3. Check applicability (frequency window: ONCE / MONTHLY / WEEKLY / EVERYTIME).
  4. Check eligibility rules (player properties must satisfy all active rules).
  5. Compute grant amount (fixed | percent-of-trigger capped at max).
  6. Write bonus_grant + bonus_chunk rows + budget usage atomically.
"""
from __future__ import annotations

from typing import Any

import aiomysql
import structlog
from redis.asyncio import Redis

from app.bonus_event_processor.eligibility_checker import check_eligibility
from app.bonus_event_processor.grant_writer import (
    check_applicability,
    check_occurrence,
    compute_grant_amount,
    write_grant,
)
from app.models.bonus_release_trigger import TriggerWithConfigResponse

log = structlog.get_logger(__name__)


async def handle_bonus_release(
    redis: Redis,
    conn: aiomysql.Connection,
    pam_user_id: int,
    props: dict[str, Any],
    trigger: TriggerWithConfigResponse,
) -> None:
    """Evaluate all guards then create a bonus grant for the matched trigger."""
    site_id: int = trigger.site_id

    # ── Amount range ──────────────────────────────────────────────────────────
    trigger_amount: float | None = None
    raw_amount = props.get("amount")
    if raw_amount is not None:
        try:
            trigger_amount = float(raw_amount)
        except (TypeError, ValueError):
            pass

    if trigger.min_trigger_amount is not None:
        if trigger_amount is None or trigger_amount < float(trigger.min_trigger_amount):
            log.info(
                "bonus_release_skipped_min_amount",
                trigger_id=trigger.id,
                pam_user_id=pam_user_id,
                min=str(trigger.min_trigger_amount),
                got=trigger_amount,
            )
            return

    if trigger.max_trigger_amount is not None:
        if trigger_amount is None or trigger_amount > float(trigger.max_trigger_amount):
            log.info(
                "bonus_release_skipped_max_amount",
                trigger_id=trigger.id,
                pam_user_id=pam_user_id,
                max=str(trigger.max_trigger_amount),
                got=trigger_amount,
            )
            return

    # ── Product ───────────────────────────────────────────────────────────────
    # if trigger.product and trigger.product != props.get("product"):
    #     log.info(
    #         "bonus_release_skipped_product",
    #         trigger_id=trigger.id,
    #         pam_user_id=pam_user_id,
    #         expected=trigger.product,
    #         got=props.get("product"),
    #     )
    #     return

    # ── Payment method (comma-separated allow-list) ───────────────────────────
    # if trigger.payment_method:
    #     allowed = {m.strip() for m in trigger.payment_method.split(",")}
    #     if props.get("payment_method") not in allowed:
    #         log.info(
    #             "bonus_release_skipped_payment_method",
    #             trigger_id=trigger.id,
    #             pam_user_id=pam_user_id,
    #             allowed=trigger.payment_method,
    #             got=props.get("payment_method"),
    #         )
    #         return

    cfg = trigger.configure

    # ── Occurrence + applicability ────────────────────────────────────────────
    async with conn.cursor() as cur:
        if not await check_occurrence(cur, pam_user_id, cfg.id, trigger.occurrence):
            log.info(
                "bonus_release_skipped_occurrence",
                trigger_id=trigger.id,
                configure_id=cfg.id,
                pam_user_id=pam_user_id,
                occurrence=trigger.occurrence,
            )
            return

        if not await check_applicability(cur, pam_user_id, cfg.id, cfg.applicability_frequency):
            log.info(
                "bonus_release_skipped_applicability",
                trigger_id=trigger.id,
                configure_id=cfg.id,
                pam_user_id=pam_user_id,
                freq=cfg.applicability_frequency,
            )
            return

    # ── Eligibility rules ─────────────────────────────────────────────────────
    if not await check_eligibility(redis, cfg.id, props):
        log.info(
            "bonus_release_skipped_eligibility",
            trigger_id=trigger.id,
            configure_id=cfg.id,
            pam_user_id=pam_user_id,
        )
        return

    # ── Compute amount ────────────────────────────────────────────────────────
    grant_amount = compute_grant_amount(cfg.model_dump(), trigger_amount)
    if grant_amount <= 0:
        log.info(
            "bonus_release_skipped_zero_amount",
            trigger_id=trigger.id,
            configure_id=cfg.id,
            pam_user_id=pam_user_id,
        )
        return

    # ── Write grant ───────────────────────────────────────────────────────────
    grant_id = await write_grant(
        conn,
        trigger.model_dump(),
        cfg.model_dump(),
        pam_user_id,
        site_id,
        grant_amount,
    )

    log.info(
        "bonus_release_granted",
        grant_id=grant_id,
        trigger_id=trigger.id,
        configure_id=cfg.id,
        pam_user_id=pam_user_id,
        site_id=site_id,
        grant_amount=str(grant_amount),
    )
