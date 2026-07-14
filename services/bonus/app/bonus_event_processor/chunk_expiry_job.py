"""Chunk expiry job.

Finds PENDING bonus chunks whose expiry window has elapsed and marks them
EXPIRED, writing a bonus_chunk_expiry audit record for each.
"""
from __future__ import annotations

from decimal import Decimal

import structlog
from redis.asyncio import Redis

from shared.clients.mysql import POOL_BONUS, get_connection
from shared.services.user import get_external_user_id
from app.bonus_event_processor.webhook_payloads import build_bonus_expired_payload, chunk_entry
from app.bonus_event_processor.webhook_sender import get_resulting_balance, send_bonus_webhook

log = structlog.get_logger(__name__)

_EXPIRED_CHUNKS_SQL = """
    SELECT bc.id, bc.chunk_amount, bc.release_amount, bc.bonus_grant_id,
           bg.site_id, bg.pam_user_id, bg.bonus_code, bg.credit_chip_type, bg.no_of_chunks,
           bc.chunk_ref, bc.wager_amount,
           DATE_ADD(bc.created_at, INTERVAL bg.chunk_expiry_days DAY), bg.wager_chip_type
    FROM bonus_chunk bc
    JOIN bonus_grant bg ON bg.id = bc.bonus_grant_id
    WHERE bc.release_status = 'PENDING'
      AND bg.chunk_expiry_days IS NOT NULL
      AND DATE_ADD(bc.created_at, INTERVAL bg.chunk_expiry_days DAY) <= NOW()
    LIMIT %s
"""

_EXPIRE_CHUNK_SQL = """
    UPDATE bonus_chunk
    SET release_status = 'EXPIRED', expiry_amount = expiry_amount + %s, updated_at = NOW()
    WHERE id = %s
"""

_INSERT_CHUNK_EXPIRY_SQL = """
    INSERT INTO bonus_chunk_expiry
        (chunk_id, bonus_grant_id, amount, type, operator, expired_at, created_at)
    VALUES (%s, %s, %s, 'AUTO', NULL, NOW(), NOW())
"""

_UPDATE_GRANT_EXPIRY_SQL = """
    UPDATE bonus_grant
    SET expiry_amount = expiry_amount + %s
    WHERE id = %s
"""


async def run_chunk_expiry_job(batch_size: int = 500, redis: Redis | None = None) -> int:
    log.info("chunk_expiry_job.started", batch_size=batch_size, job="chunk_expiry")

    webhook_events: list[dict] = []

    async with get_connection(POOL_BONUS) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_EXPIRED_CHUNKS_SQL, (batch_size,))
            rows = await cur.fetchall()

        if not rows:
            log.info("chunk_expiry_job.completed", expired_count=0, job="chunk_expiry")
            return 0

        async with conn.cursor() as cur:
            for (
                chunk_id, chunk_amount, release_amount, bonus_grant_id,
                site_id, pam_user_id, bonus_code, chip_type, no_of_chunks,
                chunk_ref, wager_amount, expires_at, wager_chip_type,
            ) in rows:
                unreleased_amount = Decimal(str(chunk_amount)) - Decimal(str(release_amount))
                expiry_amount = unreleased_amount if unreleased_amount > Decimal("0.00") else Decimal("0.00")

                await cur.execute(_EXPIRE_CHUNK_SQL, (expiry_amount, chunk_id))

                if expiry_amount <= Decimal("0.00"):
                    log.warning(
                        "chunk_expiry_job.no_unreleased_amount",
                        chunk_id=chunk_id,
                        chunk_amount=str(chunk_amount),
                        release_amount=str(release_amount),
                        job="chunk_expiry",
                    )
                    continue

                await cur.execute(
                    _INSERT_CHUNK_EXPIRY_SQL,
                    (chunk_id, bonus_grant_id, expiry_amount),
                )
                await cur.execute(_UPDATE_GRANT_EXPIRY_SQL, (expiry_amount, bonus_grant_id))

                webhook_events.append({
                    "site_id": site_id, "pam_user_id": pam_user_id,
                    "grant_id": bonus_grant_id, "bonus_code": bonus_code, "chip_type": chip_type,
                    "wager_chip_type": wager_chip_type,
                    "chunk": chunk_entry(
                        chunk_ref=chunk_ref, sequence=int(chunk_ref[2:]) if chunk_ref else 0,
                        chunk_count=no_of_chunks, amount=expiry_amount, wager_amount=wager_amount,
                        status="EXPIRED", expires_at=expires_at,
                    ),
                    "amount": expiry_amount,
                })
        await conn.commit()

    expired_count = len(rows)
    log.info("chunk_expiry_job.completed", expired_count=expired_count, job="chunk_expiry")

    if redis is not None and webhook_events:
        await _dispatch_expiry_webhooks(redis, webhook_events)

    return expired_count


async def _dispatch_expiry_webhooks(redis: Redis, webhook_events: list[dict]) -> None:
    """Send one BONUS_EXPIRED webhook per expired chunk, after the batch has committed."""
    player_id_cache: dict[int, str | None] = {}

    for evt in webhook_events:
        pam_user_id = evt["pam_user_id"]
        if pam_user_id not in player_id_cache:
            player_id_cache[pam_user_id] = await get_external_user_id(redis, pam_user_id)
        external_user_id = player_id_cache[pam_user_id]
        if not external_user_id:
            log.warning("chunk_expiry_job.player_id_not_found", pam_user_id=pam_user_id)
            continue

        resulting_balance = await get_resulting_balance(pam_user_id, evt["wager_chip_type"])
        payload = build_bonus_expired_payload(
            site_id=evt["site_id"], player_id=external_user_id, grant_id=evt["grant_id"],
            bonus_code=evt["bonus_code"], chip_type=evt["chip_type"], amount=evt["amount"],
            chunks=[evt["chunk"]], resulting_balance=resulting_balance,
        )
        await send_bonus_webhook(redis, evt["site_id"], "BONUS_EXPIRED", payload)
