"""Chunk expiry job.

Finds PENDING bonus chunks whose expiry window has elapsed and marks them
EXPIRED, writing a bonus_chunk_expiry audit record for each.
"""
from __future__ import annotations

import structlog

from shared.clients.mysql import POOL_BONUS, get_connection

log = structlog.get_logger(__name__)

_EXPIRED_CHUNKS_SQL = """
    SELECT bc.id, bc.chunk_amount, bc.bonus_grant_id
    FROM bonus_chunk bc
    JOIN bonus_grant bg ON bg.id = bc.bonus_grant_id
    WHERE bc.status = 'PENDING'
      AND bg.chunk_expiry_days IS NOT NULL
      AND DATE_ADD(bc.created_at, INTERVAL bg.chunk_expiry_days DAY) <= NOW()
    LIMIT %s
"""

_EXPIRE_CHUNK_SQL = """
    UPDATE bonus_chunk
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE id = %s
"""

_INSERT_CHUNK_EXPIRY_SQL = """
    INSERT INTO bonus_chunk_expiry
        (chunk_id, bonus_grant_id, amount, type, operator, expired_at, created_at)
    VALUES (%s, %s, %s, 'AUTO', NULL, NOW(), NOW())
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
            for chunk_id, chunk_amount, bonus_grant_id in rows:
                await cur.execute(_EXPIRE_CHUNK_SQL, (chunk_id,))
                await cur.execute(
                    _INSERT_CHUNK_EXPIRY_SQL,
                    (chunk_id, bonus_grant_id, chunk_amount),
                )
        await conn.commit()

    expired_count = len(rows)
    log.info("chunk_expiry_job.completed", expired_count=expired_count, job="chunk_expiry")
    return expired_count
