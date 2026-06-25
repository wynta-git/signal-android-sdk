"""Bonus grant handler.

When a trigger with grant_type=BONUS_grant fires:
  1. Apply amount / product / payment-method guards from the trigger.
  2. Check occurrence (how many times this user has received this bonus).
  3. Check applicability (frequency window: ONCE / MONTHLY / WEEKLY / EVERYTIME).
  4. Check eligibility rules (player properties must satisfy all active rules).
  5. Compute grant amount (fixed | percent-of-trigger capped at max).
  6. Write bonus_grant + bonus_chunk rows + budget usage atomically.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

import aiomysql
import structlog
from redis.asyncio import Redis

from app.bonus_event_processor.eligibility_checker import check_eligibility
from app.bonus_event_processor.grant_writer import (
    check_applicability,
    check_occurrence,
    compute_cashback_amount,
    compute_grant_amount,
    write_cashback_grant,
    write_grant,
)
from app.models.bonus_release_trigger import TriggerWithConfigResponse

log = structlog.get_logger(__name__)


async def handle_bonus_grant(
    redis: Redis,
    conn: aiomysql.Connection,
    pam_user_id: int,
    props: dict[str, Any],
    trigger: TriggerWithConfigResponse,
    event_id: str,
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
                "bonus_grant_skipped_min_amount",
                trigger_id=trigger.id,
                pam_user_id=pam_user_id,
                min=str(trigger.min_trigger_amount),
                got=trigger_amount,
            )
            return

    if trigger.max_trigger_amount is not None:
        if trigger_amount is None or trigger_amount > float(trigger.max_trigger_amount):
            log.info(
                "bonus_grant_skipped_max_amount",
                trigger_id=trigger.id,
                pam_user_id=pam_user_id,
                max=str(trigger.max_trigger_amount),
                got=trigger_amount,
            )
            return

    # ── Product ───────────────────────────────────────────────────────────────
    # if trigger.product and trigger.product != props.get("product"):
    #     log.info(
    #         "bonus_grant_skipped_product",
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
    #             "bonus_grant_skipped_payment_method",
    #             trigger_id=trigger.id,
    #             pam_user_id=pam_user_id,
    #             allowed=trigger.payment_method,
    #             got=props.get("payment_method"),
    #         )
    #         return

    cfg = trigger.configure

    # ── Promo code filter ─────────────────────────────────────────────────────
    promo_code: str | None = props.get("promo_code") or None
    code_id: int | None = None
    code_max_amount: Decimal | None = None

    if promo_code:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, max_amount FROM bonus_configure_code "
                "WHERE configure_id = %s AND code = %s AND active = 1 LIMIT 1",
                (cfg.id, promo_code),
            )
            code_row = await cur.fetchone()

        if code_row is None:
            log.info(
                "bonus_grant_skipped_promo_code",
                trigger_id=trigger.id,
                configure_id=cfg.id,
                promo_code=promo_code,
                pam_user_id=pam_user_id,
            )
            return

        code_id = code_row[0]
        if code_row[1] is not None:
            code_max_amount = Decimal(str(code_row[1]))

    # ── Occurrence + applicability ────────────────────────────────────────────
    async with conn.cursor() as cur:
        if not await check_occurrence(cur, pam_user_id, cfg.id, trigger.occurrence):
            log.info(
                "bonus_grant_skipped_occurrence",
                trigger_id=trigger.id,
                configure_id=cfg.id,
                pam_user_id=pam_user_id,
                occurrence=trigger.occurrence,
            )
            return

        if not await check_applicability(cur, pam_user_id, cfg.id, cfg.applicability_frequency):
            log.info(
                "bonus_grant_skipped_applicability",
                trigger_id=trigger.id,
                configure_id=cfg.id,
                pam_user_id=pam_user_id,
                freq=cfg.applicability_frequency,
            )
            return

    # ── Eligibility rules ─────────────────────────────────────────────────────
    if not await check_eligibility(redis, cfg.id, props):
        log.info(
            "bonus_grant_skipped_eligibility",
            trigger_id=trigger.id,
            configure_id=cfg.id,
            pam_user_id=pam_user_id,
        )
        return

    # ── Compute amount ────────────────────────────────────────────────────────
    cfg_dict = cfg.model_dump()
    trigger_dict = trigger.model_dump()

    grant_amount = compute_grant_amount(cfg_dict, trigger_amount)
    cashback_amount = compute_cashback_amount(cfg_dict, trigger_amount)

    if code_max_amount is not None and (grant_amount + cashback_amount) > code_max_amount:
        log.error("bonus_grant_skipped_eligibility_amount",
            trigger_id=trigger.id,
            configure_id=cfg.id,
            pam_user_id=pam_user_id,
            grant_amount=grant_amount,
            cashback_amount=cashback_amount,
            code_max_amount=code_max_amount,
        )
        return

    if code_max_amount is not None:
        grant_amount = min(grant_amount, code_max_amount)

    # ── Generate shared player_bonus_id for all grants in this event ─────────
    async with conn.cursor() as cur:
        await cur.execute("SELECT UUID_SHORT()")
        row = await cur.fetchone()
    player_bonus_id: int = row[0]

    # ── Write main grant ──────────────────────────────────────────────────────
    if grant_amount > 0:
        grant_id = await write_grant(
            conn,
            trigger_dict,
            cfg_dict,
            pam_user_id,
            site_id,
            grant_amount,
            player_bonus_id,
            event_id,
            bonus_code=promo_code,
            bonus_code_id=code_id,
        )
        log.info(
            "bonus_grant_written",
            grant_id=grant_id,
            player_bonus_id=player_bonus_id,
            trigger_id=trigger.id,
            configure_id=cfg.id,
            pam_user_id=pam_user_id,
            site_id=site_id,
            grant_amount=str(grant_amount),
        )

    # ── Write cashback grant (if configured) ──────────────────────────────────
    if cashback_amount > 0:
        if code_max_amount is not None:
            cashback_amount = min(cashback_amount, code_max_amount)

        cashback_grant_id = await write_cashback_grant(
            conn, trigger_dict, cfg_dict, pam_user_id, site_id, cashback_amount, player_bonus_id, event_id,
            bonus_code=promo_code, bonus_code_id=code_id,
        )
        log.info(
            "cashback_grant_written",
            cashback_grant_id=cashback_grant_id,
            configure_id=cfg.id,
            pam_user_id=pam_user_id,
            cashback_amount=str(cashback_amount),
        )
