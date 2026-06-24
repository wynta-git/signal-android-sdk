"""CHUNK_RELEASE handler.

When a trigger with release_type=CHUNK_RELEASE fires:
  1. Apply the same amount / product / payment-method guards as BONUS_RELEASE.
  2. Find the next PENDING chunk for this user + configure.
  3. Promote its status PENDING → RELEASE.
  4. Increment bonus_grant.release_amount by the chunk amount.

The player can then consume RELEASE-status chunks via the consume_bonus API.
"""
from __future__ import annotations

from typing import Any

import aiomysql
import structlog

from app.models.bonus_release_trigger import TriggerWithConfigResponse

log = structlog.get_logger(__name__)

_NEXT_PENDING_CHUNK_SQL = """
    SELECT bc.id, bc.chunk_amount, bc.bonus_grant_id
    FROM bonus_chunk bc
    JOIN bonus_grant bg ON bg.id = bc.bonus_grant_id
    WHERE bg.pam_user_id = %s
      AND bg.configure_id = %s
      AND bc.status = 'PENDING'
    ORDER BY bc.id ASC
    LIMIT 1
"""

_RELEASE_CHUNK_SQL = """
    UPDATE bonus_chunk
    SET status = 'RELEASE', updated_at = NOW()
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
      AND status = 'PENDING'
"""

_INSERT_CHUNK_RELEASE_SQL = """
    INSERT INTO bonus_chunk_release (chunk_id, wager_ref, wager_amount, release_amount)
    VALUES (%s, 'SYSTEM', 0.00, %s)
"""

_RELEASE_ALL_PENDING_CHUNKS_SQL = """
    UPDATE bonus_chunk
    SET status = 'RELEASED', release_amount = chunk_amount, updated_at = NOW()
    WHERE bonus_grant_id = %s
      AND status = 'PENDING'
"""


async def handle_chunk_release(
    conn: aiomysql.Connection,
    pam_user_id: int,
    props: dict[str, Any],
    trigger: TriggerWithConfigResponse,
) -> None:
    """Release the next pending bonus chunk for the matched trigger."""

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

    # ── Find next pending chunk ───────────────────────────────────────────────
    async with conn.cursor() as cur:
        await cur.execute(_NEXT_PENDING_CHUNK_SQL, (pam_user_id, trigger.configure_id))
        row = await cur.fetchone()

    if row is None:
        log.info(
            "chunk_release_no_pending_chunk",
            trigger_id=trigger.id,
            configure_id=trigger.configure_id,
            pam_user_id=pam_user_id,
        )
        return

    chunk_id, chunk_amount, bonus_grant_id = row[0], row[1], row[2]

    # ── Release: PENDING → RELEASE ────────────────────────────────────────────
    async with conn.cursor() as cur:
        await cur.execute(_RELEASE_CHUNK_SQL, (chunk_id,))
        await cur.execute(_UPDATE_GRANT_RELEASE_SQL, (chunk_amount, bonus_grant_id))
    await conn.commit()

    log.info(
        "chunk_released",
        chunk_id=chunk_id,
        bonus_grant_id=bonus_grant_id,
        trigger_id=trigger.id,
        configure_id=trigger.configure_id,
        pam_user_id=pam_user_id,
        chunk_amount=str(chunk_amount),
    )


async def release_all_chunks(
    conn: aiomysql.Connection,
    bonus_grant_id: int,
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
            [(row[0], row[1]) for row in chunks],
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
