"""CHUNK_RELEASE handler.

When a trigger with release_type=CHUNK_RELEASE fires:
  1. Apply the min/max amount guards.
  2. Find all PENDING chunks for this player+site, oldest first.
  3. Apply trigger_amount as wager contribution across chunks in order.
     - Partial: wager_amount incremented but required_wager_amount not yet met.
     - Full: release_status → RELEASE, audit row inserted, grant release_amount updated.
  4. One commit covers all chunk updates from the event.
"""
from __future__ import annotations

import json
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import aiomysql
import structlog
from redis.asyncio import Redis

from app.config import settings
from app.models.bonus_release_trigger import TriggerWithConfigResponse
from app.bonus_event_processor.webhook_payloads import build_bonus_released_payload, chunk_entry
from app.bonus_event_processor.webhook_sender import get_resulting_balance, send_bonus_webhook

log = structlog.get_logger(__name__)

_PENDING_CHUNKS_SQL = """
    SELECT bc.id, bc.chunk_amount, bc.bonus_grant_id, bc.required_wager_amount, bc.wager_amount,
           bc.wager_multiplier, bc.product_wager_multiplier,
           bc.chunk_ref, bg.bonus_code, bg.no_of_chunks, bg.credit_chip_type,
           DATE_ADD(bc.created_at, INTERVAL bg.chunk_expiry_days DAY), bg.wager_chip_type
    FROM bonus_chunk bc
    JOIN bonus_grant bg ON bg.id = bc.bonus_grant_id
    WHERE bc.site_id = %s AND bc.pam_user_id = %s AND bc.release_status IN ('PENDING', 'INIT')
    ORDER BY bc.id ASC
"""


def _parse_product_wager_multiplier(raw: object) -> dict | None:
    """JSON column value -> {product: multiplier}. Handles both str and pre-parsed dict."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return None
    if not isinstance(raw, dict):
        return None
    return raw


_RELEASE_CHUNK_WITH_WAGER_SQL = """
    UPDATE bonus_chunk
    SET wager_amount = %s, release_amount = %s, release_status = %s, updated_at = NOW()
    WHERE id = %s
"""

_UPDATE_GRANT_RELEASE_SQL = """
    UPDATE bonus_grant
    SET release_amount = release_amount + %s
    WHERE id = %s
"""

_ALL_PENDING_CHUNKS_SQL = """
    SELECT id, chunk_amount, chunk_ref, required_wager_amount
    FROM bonus_chunk
    WHERE bonus_grant_id = %s
      AND release_status = 'PENDING'
"""

_INSERT_CHUNK_RELEASE_SQL = """
    INSERT INTO bonus_chunk_release (chunk_id, site_id, event_id, wager_ref, wager_amount, release_amount, bonus_release_id)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
"""

_UPDATE_BONUS_RELEASE_TOTALS_SQL = """
    UPDATE bonus_release SET wager_amount = %s, release_amount = %s WHERE id = %s
"""

_RELEASE_ALL_PENDING_CHUNKS_SQL = """
    UPDATE bonus_chunk
    SET release_status = 'RELEASE', release_amount = chunk_amount, updated_at = NOW()
    WHERE bonus_grant_id = %s
      AND release_status = 'PENDING'
"""

_INSERT_BONUS_RELEASE_SQL = """
    INSERT INTO bonus_release
        (site_id, pam_user_id, event_id, wager_ref,
         chip_type, product, game_type, game_name,
         wager_amount, release_amount)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""


async def handle_chunk_release(
    redis: Redis,
    conn: aiomysql.Connection,
    pam_user_id: int,
    props: dict[str, Any],
    trigger: TriggerWithConfigResponse,
    event_id: str,
) -> None:
    """Apply wager contribution to pending chunks and release any that meet their target."""

    # ── Dedup: skip if this event was already processed for this site ─────────
    site_id: int = trigger.site_id
    dedup_key = f"bonus:chunk_release:dedup:{event_id}:{site_id}"
    if await redis.exists(dedup_key):
        log.info("chunk_release_duplicate_event", event_id=event_id, site_id=site_id)
        return

    # ── Amount range ──────────────────────────────────────────────────────────
    trigger_amount: float | None = None
    raw_amount = props.get("transaction_amount")
    if raw_amount is not None:
        try:
            trigger_amount = float(raw_amount)
        except (TypeError, ValueError):
            pass

    if trigger.min_trigger_amount is not None:
        if trigger_amount is None or trigger_amount < float(trigger.min_trigger_amount):
            log.info(
                "chunk_release_skipped_min_amount",
                trigger_id=trigger.id,
                pam_user_id=pam_user_id,
                min=str(trigger.min_trigger_amount),
                got=trigger_amount,
            )
            return

    if trigger.max_trigger_amount is not None:
        if trigger_amount is None or trigger_amount > float(trigger.max_trigger_amount):
            log.info(
                "chunk_release_skipped_max_amount",
                trigger_id=trigger.id,
                pam_user_id=pam_user_id,
                max=str(trigger.max_trigger_amount),
                got=trigger_amount,
            )
            return

    # ── Product ───────────────────────────────────────────────────────────────
    # if trigger.product and trigger.product != props.get("product"):
    #     log.info(
    #         "chunk_release_skipped_product",
    #         trigger_id=trigger.id,
    #         pam_user_id=pam_user_id,
    #         expected=trigger.product,
    #         got=props.get("product"),
    #     )
    #     return

    # # ── Payment method ────────────────────────────────────────────────────────
    # if trigger.payment_method:
    #     allowed = {m.strip() for m in trigger.payment_method.split(",")}
    #     if props.get("payment_method") not in allowed:
    #         log.info(
    #             "chunk_release_skipped_payment_method",
    #             trigger_id=trigger.id,
    #             pam_user_id=pam_user_id,
    #             allowed=trigger.payment_method,
    #             got=props.get("payment_method"),
    #         )
    #         return

    # ── Fetch all PENDING chunks for this player/site, oldest first ───────────
    wager_ref: str = str(props.get("wager_tnx_id") or "")
    remaining = Decimal(str(trigger_amount)) if trigger_amount else Decimal("0.00")
    if remaining <= Decimal("0.00"):
        log.info(
            "chunk_release_no_remaining",
            trigger_id=trigger.id,
            pam_user_id=pam_user_id,
            site_id=site_id,
            remaining=remaining
        )
        return

    async with conn.cursor() as cur:
        await cur.execute(_PENDING_CHUNKS_SQL, (site_id, pam_user_id))
        chunks = await cur.fetchall()

    if not chunks:
        log.info(
            "chunk_release_no_pending_chunks",
            trigger_id=trigger.id,
            pam_user_id=pam_user_id,
            site_id=site_id,
        )
        return

    # ── Insert bonus_release header row; totals back-filled after the loop ───
    async with conn.cursor() as cur:
        await cur.execute(
            _INSERT_BONUS_RELEASE_SQL,
            (
                site_id, str(pam_user_id), event_id, wager_ref,
                props.get("chip_type"), props.get("product"),
                props.get("game_type"), props.get("game_name"),
                0.00, 0.00,
            ),
        )
        bonus_release_id = cur.lastrowid

    # ── Apply wager contribution across chunks in FIFO order ─────────────────
    # Each chunk keeps a fixed required_wager_amount (chunk_amount × the chunk's
    # own base wager_multiplier, set at grant time — unchanged by this logic).
    # A per-product override changes how fast *this event's* raw wagered money
    # advances new_wager toward that fixed target: weight_ratio = base/effective,
    # so a product configured *above* the base multiplier contributes less per
    # raw dollar (clears slower), and one configured *below* contributes more
    # (clears faster). release_amount/event_release keep dividing by the
    # chunk's own base wager_multiplier throughout, so progress stays monotonic
    # even as different products contribute across the life of one chunk.
    product = props.get("product")
    released_count = 0
    total_wager    = Decimal("0.00")
    total_release  = Decimal("0.00")
    by_grant: dict[int, dict[str, Any]] = {}

    for row in chunks:
        if remaining <= Decimal("0.00"):
            break

        chunk_id          = row[0]
        chunk_amount      = Decimal(str(row[1]))
        grant_id          = row[2]
        required          = Decimal(str(row[3]))
        curr_wager        = Decimal(str(row[4]))
        wager_multiplier  = Decimal(str(row[5]))
        chunk_ref         = row[7]
        bonus_code        = row[8]
        chunk_count       = row[9]
        chip_type         = row[10]
        expires_at        = row[11]
        wager_chip_type   = row[12]

        product_wager_multiplier = _parse_product_wager_multiplier(row[6])
        effective_multiplier = wager_multiplier
        if product and product_wager_multiplier and product in product_wager_multiplier:
            effective_multiplier = Decimal(str(product_wager_multiplier[product]))
        weight_ratio = (wager_multiplier / effective_multiplier) if effective_multiplier > 0 else Decimal("1")

        still_needed       = required - curr_wager
        raw_needed_to_fill = (still_needed / weight_ratio).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        contributed        = min(remaining, raw_needed_to_fill)
        weighted_contribution = (contributed * weight_ratio).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        new_wager      = curr_wager + weighted_contribution
        remaining     -= contributed

        is_full        = new_wager >= required
        release_amount = chunk_amount if is_full else (new_wager / wager_multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        release_status = 'RELEASE' if is_full else 'PENDING'

        event_release  = (weighted_contribution / wager_multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_wager   += contributed
        total_release += event_release

        async with conn.cursor() as cur:
            await cur.execute(_RELEASE_CHUNK_WITH_WAGER_SQL, (new_wager, release_amount, release_status, chunk_id))
            await cur.execute(_INSERT_CHUNK_RELEASE_SQL, (chunk_id, site_id, event_id, wager_ref, float(contributed), float(event_release), bonus_release_id))
            await cur.execute(_UPDATE_GRANT_RELEASE_SQL, (event_release, grant_id))
            if is_full:
                released_count += 1

        log.info(
            "chunk_released" if is_full else "chunk_wager_partial",
            chunk_id=chunk_id,
            pam_user_id=pam_user_id,
            contributed=str(contributed),
            new_wager=str(new_wager),
            release_amount=str(release_amount),
            release_status=release_status,
        )

        if event_release > Decimal("0.00"):
            grant_bucket = by_grant.setdefault(grant_id, {
                "bonus_code": bonus_code, "chip_type": chip_type, "wager_chip_type": wager_chip_type,
                "amount": Decimal("0.00"), "chunks": [],
            })
            grant_bucket["amount"] += event_release
            grant_bucket["chunks"].append(chunk_entry(
                chunk_ref=chunk_ref, sequence=int(chunk_ref[2:]) if chunk_ref else 0,
                chunk_count=chunk_count, amount=event_release, wager_amount=new_wager,
                status=release_status, expires_at=expires_at,
            ))

    async with conn.cursor() as cur:
        await cur.execute(_UPDATE_BONUS_RELEASE_TOTALS_SQL, (float(total_wager), float(total_release), bonus_release_id))

    await conn.commit()
    await redis.set(dedup_key, "1", ex=settings.dedup_event_ttl)

    external_user_id = props.get("user_id")
    if external_user_id and by_grant:
        for grant_id, bucket in by_grant.items():
            resulting_balance = await get_resulting_balance(pam_user_id, bucket["wager_chip_type"])
            payload = build_bonus_released_payload(
                site_id=site_id, player_id=str(external_user_id), grant_id=grant_id,
                bonus_code=bucket["bonus_code"], chip_type=bucket["chip_type"],
                amount=bucket["amount"], chunks=bucket["chunks"], resulting_balance=resulting_balance,
            )
            await send_bonus_webhook(redis, site_id, pam_user_id, "BONUS_RELEASED", payload)

    log.info(
        "chunk_release_complete",
        trigger_id=trigger.id,
        pam_user_id=pam_user_id,
        site_id=site_id,
        released_count=released_count,
        trigger_amount=str(trigger_amount),
    )


async def release_all_chunks(
    conn: aiomysql.Connection,
    bonus_grant_id: int,
    site_id: int,
    event_id: str,
    pam_user_id: int,
    bonus_code: str | None = None,
    chip_type: str | None = None,
    wager_chip_type: str | None = None,
    external_user_id: str | None = None,
    redis: Redis | None = None,
) -> None:
    """Release all PENDING chunks for a grant in one pass.

    Used when wagering_multiplier=0 (cashback) so the full grant amount
    is immediately available — no per-event trigger needed.
    """
    async with conn.cursor() as cur:
        await cur.execute(_ALL_PENDING_CHUNKS_SQL, (bonus_grant_id,))
        chunks = await cur.fetchall()

    if not chunks:
        log.info("release_all_chunks_nothing_pending", bonus_grant_id=bonus_grant_id)
        return

    total: float = sum(float(row[1]) for row in chunks)

    async with conn.cursor() as cur:
        await cur.execute(
            _INSERT_BONUS_RELEASE_SQL,
            (
                site_id, str(pam_user_id), event_id, "SYSTEM",
                None, None, None, None,
                0.00, total,
            ),
        )
        bonus_release_id = cur.lastrowid

        await cur.executemany(
            _INSERT_CHUNK_RELEASE_SQL,
            [
                (row[0], site_id, event_id, "SYSTEM", 0.00, row[1], bonus_release_id)
                for row in chunks
            ],
        )
        await cur.execute(_RELEASE_ALL_PENDING_CHUNKS_SQL, (bonus_grant_id,))
        await cur.execute(_UPDATE_GRANT_RELEASE_SQL, (total, bonus_grant_id))
    await conn.commit()

    log.info(
        "all_chunks_released",
        bonus_grant_id=bonus_grant_id,
        chunk_count=len(chunks),
        total_released=str(total),
    )

    if external_user_id and redis is not None:
        chunk_count = len(chunks)
        entries = [
            chunk_entry(
                chunk_ref=row[2], sequence=int(row[2][2:]) if row[2] else 0,
                chunk_count=chunk_count, amount=row[1], wager_amount=row[3],
                status="RELEASE", expires_at=None,
            )
            for row in chunks
        ]
        resulting_balance = await get_resulting_balance(pam_user_id, wager_chip_type)
        payload = build_bonus_released_payload(
            site_id=site_id, player_id=str(external_user_id), grant_id=bonus_grant_id,
            bonus_code=bonus_code, chip_type=chip_type or "",
            amount=Decimal(str(total)), chunks=entries, resulting_balance=resulting_balance,
        )
        await send_bonus_webhook(redis, site_id, pam_user_id, "BONUS_RELEASED", payload)
