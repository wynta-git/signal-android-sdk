"""Bonus forfeit job.

Finds bonus grants whose bonus_expiry_days window has elapsed and still carry
a released-but-unconsumed wallet balance.  For each such grant:
  1. Inserts a bonus_forfeit record (type=AUTO) for the remaining balance.
  2. Credits forfeited_amount on bonus_grant and on each RELEASE-status
     bonus_chunk that still holds an unconsumed released balance.

Expiring PENDING chunks that were never released is handled separately by
chunk_expiry_job.py.

The NOT EXISTS guard on bonus_forfeit makes every run idempotent.
"""
from __future__ import annotations

from decimal import Decimal

import structlog
from redis.asyncio import Redis

from shared.clients.mysql import POOL_BONUS, get_connection
from shared.services.user import get_external_user_id
from app.bonus_event_processor.webhook_payloads import build_bonus_forfeited_payload, chunk_entry
from app.bonus_event_processor.webhook_sender import get_resulting_balance, send_bonus_webhook

log = structlog.get_logger(__name__)

_EXPIRED_GRANTS_SQL = """
    SELECT bg.id, bg.release_amount, bg.consume_amount,
           bg.site_id, bg.pam_user_id, bg.bonus_code, bg.credit_chip_type, bg.no_of_chunks,
           DATE_ADD(bg.created_at, INTERVAL bg.bonus_expiry_days DAY), bg.wager_chip_type
    FROM bonus_grant bg
    WHERE bg.bonus_expiry_days IS NOT NULL
      AND DATE_ADD(bg.created_at, INTERVAL bg.bonus_expiry_days DAY) <= NOW()
      AND bg.release_amount > bg.consume_amount
      AND EXISTS (
          SELECT 1 FROM bonus_chunk bc
          WHERE bc.bonus_grant_id = bg.id
            AND bc.release_status = 'RELEASE'
            AND bc.consume_status = 'PENDING'
      )
      AND NOT EXISTS (
          SELECT 1 FROM bonus_forfeit bf WHERE bf.bonus_grant_id = bg.id
      )
    LIMIT %s
"""

_INSERT_FORFEIT_SQL = """
    INSERT INTO bonus_forfeit
        (bonus_grant_id, requested_amount, amount, type, operator, forfeited_at, created_at)
    VALUES (%s, %s, %s, 'AUTO', NULL, NOW(), NOW())
"""

_RELEASED_UNCONSUMED_CHUNKS_SQL = """
    SELECT id, release_amount, consume_amount, chunk_ref, wager_amount
    FROM bonus_chunk
    WHERE bonus_grant_id = %s AND release_status = 'RELEASE' AND consume_status = 'PENDING'
"""

_FORFEIT_CHUNK_SQL = """
    UPDATE bonus_chunk
    SET forfeited_amount = forfeited_amount + %s, updated_at = NOW(), consume_status='FORFEITED'
    WHERE id = %s
"""

_UPDATE_GRANT_FORFEITED_SQL = """
    UPDATE bonus_grant
    SET forfeited_amount = forfeited_amount + %s
    WHERE id = %s
"""


async def run_bonus_forfeit_job(batch_size: int = 500, redis: Redis | None = None) -> int:
    log.info("bonus_forfeit_job.started", batch_size=batch_size, job="bonus_forfeit")

    webhook_events: list[dict] = []

    async with get_connection(POOL_BONUS) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_EXPIRED_GRANTS_SQL, (batch_size,))
            grants = await cur.fetchall()

        if not grants:
            log.info("bonus_forfeit_job.completed", forfeited_count=0, job="bonus_forfeit")
            return 0

        forfeited_count = 0
        for (
            grant_id, release_amount, consume_amount,
            site_id, pam_user_id, bonus_code, chip_type, no_of_chunks, expires_at, wager_chip_type,
        ) in grants:
            forfeit_amount = Decimal(str(release_amount)) - Decimal(str(consume_amount))

            # Collect released-but-unconsumed chunks before writing anything
            async with conn.cursor() as cur:
                await cur.execute(_RELEASED_UNCONSUMED_CHUNKS_SQL, (grant_id,))
                released_chunks = await cur.fetchall()

            forfeited_chunks: list[dict] = []
            async with conn.cursor() as cur:
                await cur.execute(_INSERT_FORFEIT_SQL, (grant_id, forfeit_amount, forfeit_amount))
                await cur.execute(_UPDATE_GRANT_FORFEITED_SQL, (forfeit_amount, grant_id))

                for chunk_id, chunk_release_amount, chunk_consume_amount, chunk_ref, wager_amount in released_chunks:
                    available = Decimal(str(chunk_release_amount)) - Decimal(str(chunk_consume_amount))
                    if available <= Decimal("0.00"):
                        continue
                    await cur.execute(_FORFEIT_CHUNK_SQL, (available, chunk_id))
                    forfeited_chunks.append(chunk_entry(
                        chunk_ref=chunk_ref, sequence=int(chunk_ref[2:]) if chunk_ref else 0,
                        chunk_count=no_of_chunks, amount=available, wager_amount=wager_amount,
                        status="FORFEITED", expires_at=expires_at,
                    ))

            forfeited_count += 1

            if forfeited_chunks:
                webhook_events.append({
                    "site_id": site_id, "pam_user_id": pam_user_id,
                    "grant_id": grant_id, "bonus_code": bonus_code, "chip_type": chip_type,
                    "wager_chip_type": wager_chip_type,
                    "amount": forfeit_amount, "chunks": forfeited_chunks,
                })

        await conn.commit()

    log.info("bonus_forfeit_job.completed", forfeited_count=forfeited_count, job="bonus_forfeit")

    if redis is not None and webhook_events:
        await _dispatch_forfeit_webhooks(redis, webhook_events)

    return forfeited_count


async def _dispatch_forfeit_webhooks(redis: Redis, webhook_events: list[dict]) -> None:
    """Send one BONUS_FORFEITED webhook per forfeited grant, after the batch has committed."""
    player_id_cache: dict[int, str | None] = {}

    for evt in webhook_events:
        pam_user_id = evt["pam_user_id"]
        if pam_user_id not in player_id_cache:
            player_id_cache[pam_user_id] = await get_external_user_id(redis, pam_user_id)
        external_user_id = player_id_cache[pam_user_id]
        if not external_user_id:
            log.warning("bonus_forfeit_job.player_id_not_found", pam_user_id=pam_user_id)
            continue

        resulting_balance = await get_resulting_balance(pam_user_id, evt["wager_chip_type"])
        payload = build_bonus_forfeited_payload(
            site_id=evt["site_id"], player_id=external_user_id, grant_id=evt["grant_id"],
            bonus_code=evt["bonus_code"], chip_type=evt["chip_type"], amount=evt["amount"],
            chunks=evt["chunks"], resulting_balance=resulting_balance,
        )
        await send_bonus_webhook(redis, evt["site_id"], pam_user_id, "BONUS_FORFEITED", payload)
