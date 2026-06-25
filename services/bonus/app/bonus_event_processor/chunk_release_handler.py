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

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import aiomysql
import structlog

from app.models.bonus_release_trigger import TriggerWithConfigResponse

log = structlog.get_logger(__name__)

_PENDING_CHUNKS_SQL = """
    SELECT id, chunk_amount, bonus_grant_id, required_wager_amount, wager_amount
    FROM bonus_chunk
    WHERE site_id = %s AND pam_user_id = %s AND release_status in  ('PENDING','INIT')
    ORDER BY id ASC
"""

_UPDATE_CHUNK_WAGER_SQL = """
    UPDATE bonus_chunk
    SET wager_amount = wager_amount + %s, release_amount = %s, updated_at = NOW()
    WHERE id = %s
"""

_RELEASE_CHUNK_WITH_WAGER_SQL = """
    UPDATE bonus_chunk
    SET wager_amount = %s, release_amount = %s, release_status = 'RELEASE', updated_at = NOW()
    WHERE id = %s
"""

_UPDATE_GRANT_RELEASE_SQL = """
    UPDATE bonus_grant
    SET release_amount = release_amount + %s
    WHERE id = %s
"""

_ALL_PENDING_CHUNKS_SQL = """
    SELECT id, chunk_amount
    FROM bonus_chunk
    WHERE bonus_grant_id = %s
      AND release_status = 'PENDING'
"""

_INSERT_CHUNK_RELEASE_SQL = """
    INSERT INTO bonus_chunk_release (chunk_id, site_id, event_id, wager_ref, wager_amount, release_amount)
    VALUES (%s, %s, %s, %s, %s, %s)
"""

_RELEASE_ALL_PENDING_CHUNKS_SQL = """
    UPDATE bonus_chunk
    SET release_status = 'RELEASED', release_amount = chunk_amount, updated_at = NOW()
    WHERE bonus_grant_id = %s
      AND release_status = 'PENDING'
"""


async def handle_chunk_release(
    conn: aiomysql.Connection,
    pam_user_id: int,
    props: dict[str, Any],
    trigger: TriggerWithConfigResponse,
    event_id: str,
) -> None:
    """Apply wager contribution to pending chunks and release any that meet their target."""

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
    site_id: int = trigger.site_id
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

    # ── Apply wager contribution across chunks in FIFO order ─────────────────
    released_count = 0

    for row in chunks:
        if remaining <= Decimal("0.00"):
            break

        chunk_id     = row[0]
        chunk_amount = Decimal(str(row[1]))
        grant_id     = row[2]
        required     = Decimal(str(row[3]))
        curr_wager   = Decimal(str(row[4]))

        still_needed = required - curr_wager
        contributed  = min(remaining, still_needed)
        new_wager    = curr_wager + contributed
        remaining   -= contributed

        async with conn.cursor() as cur:
            if new_wager >= required:
                release_amount = chunk_amount
                await cur.execute(_RELEASE_CHUNK_WITH_WAGER_SQL, (new_wager, release_amount, chunk_id))
                await cur.execute(
                    _INSERT_CHUNK_RELEASE_SQL,
                    (chunk_id, site_id, event_id, wager_ref, float(contributed), float(release_amount)),
                )
                await cur.execute(_UPDATE_GRANT_RELEASE_SQL, (release_amount, grant_id))
                released_count += 1
                log.info(
                    "chunk_released",
                    chunk_id=chunk_id,
                    grant_id=grant_id,
                    pam_user_id=pam_user_id,
                    chunk_amount=str(chunk_amount),
                    release_amount=str(release_amount),
                    wager_contributed=str(contributed),
                )
            else:
                release_amount = (new_wager / required * chunk_amount).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
                await cur.execute(_UPDATE_CHUNK_WAGER_SQL, (contributed, release_amount, chunk_id))
                log.info(
                    "chunk_wager_partial",
                    chunk_id=chunk_id,
                    pam_user_id=pam_user_id,
                    contributed=str(contributed),
                    new_wager=str(new_wager),
                    required=str(required),
                    release_amount=str(release_amount),
                )

    await conn.commit()

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
        await cur.executemany(
            _INSERT_CHUNK_RELEASE_SQL,
            [(row[0], site_id, event_id, "SYSTEM", 0.00, row[1]) for row in chunks],
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
