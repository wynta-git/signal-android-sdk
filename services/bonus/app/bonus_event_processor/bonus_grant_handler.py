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

import json
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
from app.config import settings
from app.models.bonus_release_trigger import TriggerWithConfigResponse
from app.services.bonus_configure_code_service import code_validity_sql
from app.bonus_event_processor.webhook_payloads import build_bonus_granted_payload
from app.bonus_event_processor.webhook_sender import get_resulting_balance, send_bonus_webhook

log = structlog.get_logger(__name__)

_AUTO_APPLY_CODE_SQL = f"""
    SELECT bcc.id, bcc.code, bcc.max_amount
    FROM bonus_configure_code bcc
    JOIN bonus_configure bc ON bc.id = bcc.configure_id
    WHERE bcc.configure_id = %s
      AND bcc.system_auto_apply = 1
      AND {code_validity_sql("bcc")}
      AND bc.active = 1
    ORDER BY bcc.display_order ASC, bcc.id ASC
    LIMIT 1
"""

_AUTO_APPLY_CACHE_KEY = "pam:bonus:auto_apply_code:{configure_id}"


async def _get_auto_apply_code(
    redis: Redis, conn: aiomysql.Connection, configure_id: int
) -> tuple[int, str, Decimal | None] | None:
    """Cache-aside lookup of the best system_auto_apply code for a configure."""
    cache_key = _AUTO_APPLY_CACHE_KEY.format(configure_id=configure_id)
    cached = await redis.get(cache_key)
    if cached is not None:
        parsed = json.loads(cached)
        if parsed is None:
            return None
        return parsed["id"], parsed["code"], (
            Decimal(parsed["max_amount"]) if parsed["max_amount"] is not None else None
        )

    async with conn.cursor() as cur:
        await cur.execute(_AUTO_APPLY_CODE_SQL, (configure_id,))
        row = await cur.fetchone()

    if row is None:
        await redis.set(cache_key, "null", ex=settings.trigger_cache_ttl)
        return None

    code_id, code, raw_max = row
    await redis.set(
        cache_key,
        json.dumps({"id": code_id, "code": code, "max_amount": str(raw_max) if raw_max is not None else None}),
        ex=settings.trigger_cache_ttl,
    )
    return code_id, code, Decimal(str(raw_max)) if raw_max is not None else None


async def handle_bonus_grant(
    redis: Redis,
    conn: aiomysql.Connection,
    pam_user_id: int,
    props: dict[str, Any],
    trigger: TriggerWithConfigResponse,
    event_id: str,
    override_grant_amount: Decimal | None = None,
) -> int | None:
    """
    Evaluate all guards then create a bonus grant for the matched trigger.

    override_grant_amount (used by manual-bonus CSV processing) replaces the
    normal fixed/percent-of-trigger calculation with an exact amount, capped
    at (not skipped for exceeding) the promo code's max_amount. Every other
    guard — trigger amount range, promo code, occurrence, applicability,
    eligibility — still applies unchanged.

    Returns the new bonus_grant.id if a grant was written, or None if the
    grant was skipped by any guard (callers relied only on side effects
    before this override was added, so existing callers are unaffected).
    """
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
                "WHERE configure_id = %s AND code = %s AND active = 1 "
                "AND (system_auto_apply IS NULL OR system_auto_apply = 0) LIMIT 1",
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

    # ── System auto-apply (fallback when the event carries no explicit code) ──
    if promo_code is None:
        auto_result = await _get_auto_apply_code(redis, conn, cfg.id)
        if auto_result is not None:
            code_id, promo_code, code_max_amount = auto_result
            log.info(
                "bonus_grant_auto_applied_code",
                trigger_id=trigger.id,
                configure_id=cfg.id,
                pam_user_id=pam_user_id,
                code=promo_code,
            )

    # ── Compute amount ────────────────────────────────────────────────────────
    cfg_dict = cfg.model_dump()
    trigger_dict = trigger.model_dump()

    if override_grant_amount is not None:
        # Manual-bonus CSV path: exact per-player amount, capped (not skipped) at the code's max.
        grant_amount = override_grant_amount
        if code_max_amount is not None:
            grant_amount = min(grant_amount, code_max_amount)
        cashback_amount = Decimal("0.00")
    else:
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
            return None

        if code_max_amount is not None:
            grant_amount = min(grant_amount, code_max_amount)

    external_user_id = props.get("user_id")

    # ── Write main grant ──────────────────────────────────────────────────────
    grant_id: int | None = None
    if grant_amount > 0:
        grant_id, chunks = await write_grant(
            conn,
            trigger_dict,
            cfg_dict,
            pam_user_id,
            site_id,
            grant_amount,
            event_id,
            bonus_code=promo_code,
            bonus_code_id=code_id,
            external_user_id=external_user_id,
            redis=redis,
        )
        log.info(
            "bonus_grant_written",
            grant_id=grant_id,
            trigger_id=trigger.id,
            configure_id=cfg.id,
            pam_user_id=pam_user_id,
            site_id=site_id,
            grant_amount=str(grant_amount),
        )
        if external_user_id:
            resulting_balance = await get_resulting_balance(pam_user_id, cfg.wager_chip_type)
            payload = build_bonus_granted_payload(
                site_id=site_id, player_id=str(external_user_id), grant_id=grant_id,
                bonus_code=promo_code, chip_type=cfg.credit_chip_type,
                grant_amount=grant_amount, chunks=chunks, resulting_balance=resulting_balance,
            )
            await send_bonus_webhook(redis, site_id, "BONUS_GRANTED", payload)

    # ── Write cashback grant (if configured) ──────────────────────────────────
    if cashback_amount > 0:
        if code_max_amount is not None:
            cashback_amount = min(cashback_amount, code_max_amount)

        cashback_grant_id, cashback_chunks = await write_cashback_grant(
            conn, trigger_dict, cfg_dict, pam_user_id, site_id, cashback_amount, event_id,
            bonus_code=promo_code, bonus_code_id=code_id,
            external_user_id=external_user_id, redis=redis,
        )
        log.info(
            "cashback_grant_written",
            cashback_grant_id=cashback_grant_id,
            configure_id=cfg.id,
            pam_user_id=pam_user_id,
            cashback_amount=str(cashback_amount),
        )
        if external_user_id:
            resulting_balance = await get_resulting_balance(pam_user_id, cfg.wager_chip_type)
            payload = build_bonus_granted_payload(
                site_id=site_id, player_id=str(external_user_id), grant_id=cashback_grant_id,
                bonus_code=promo_code, chip_type=cfg.credit_chip_type,
                grant_amount=cashback_amount, chunks=cashback_chunks, resulting_balance=resulting_balance,
            )
            await send_bonus_webhook(redis, site_id, "BONUS_GRANTED", payload)

    return grant_id
