"""Chunk expiry job.

Finds PENDING bonus chunks whose expiry window has elapsed and marks them
EXPIRED, writing a bonus_chunk_expiry audit record for each.
"""
from __future__ import annotations

from decimal import Decimal

import structlog

from shared.clients.mysql import POOL_BONUS, get_connection

log = structlog.get_logger(__name__)

_EXPIRED_CHUNKS_SQL = """
    SELECT bc.id, bc.chunk_amount, bc.release_amount, bc.bonus_grant_id
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


async def run_chunk_expiry_job(batch_size: int = 500) -> int:
    log.info("chunk_expiry_job.started", batch_size=batch_size, job="chunk_expiry")

    async with get_connection(POOL_BONUS) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_EXPIRED_CHUNKS_SQL, (batch_size,))
            rows = await cur.fetchall()

        if not rows:
            log.info("chunk_expiry_job.completed", expired_count=0, job="chunk_expiry")
            return 0

        async with conn.cursor() as cur:
            for chunk_id, chunk_amount, release_amount, bonus_grant_id in rows:
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
        await conn.commit()

    expired_count = len(rows)
    log.info("chunk_expiry_job.completed", expired_count=expired_count, job="chunk_expiry")
    return expired_count
