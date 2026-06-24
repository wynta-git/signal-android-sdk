"""Bonus forfeit job.

Finds bonus grants whose bonus_expiry_days window has elapsed and still carry
a released-but-unconsumed wallet balance.  For each such grant:
  1. Inserts a bonus_forfeit record (type=AUTO) for the remaining balance.
  2. Expires any PENDING chunks that were never released, writing
     bonus_chunk_expiry records for each.

The NOT EXISTS guard on bonus_forfeit makes every run idempotent.
"""
from __future__ import annotations

from decimal import Decimal

import structlog

from shared.clients.mysql import POOL_BONUS, get_connection

log = structlog.get_logger(__name__)

_EXPIRED_GRANTS_SQL = """
    SELECT bg.id, bg.release_amount, bg.consume_amount
    FROM bonus_grant bg
    WHERE bg.bonus_expiry_days IS NOT NULL
      AND DATE_ADD(bg.created_at, INTERVAL bg.bonus_expiry_days DAY) <= NOW()
      AND bg.release_amount > bg.consume_amount
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

_PENDING_CHUNKS_SQL = """
    SELECT id, chunk_amount
    FROM bonus_chunk
    WHERE bonus_grant_id = %s AND status = 'PENDING'
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


async def run_bonus_forfeit_job(batch_size: int = 500) -> int:
    log.info("bonus_forfeit_job.started", batch_size=batch_size, job="bonus_forfeit")

    async with get_connection(POOL_BONUS) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_EXPIRED_GRANTS_SQL, (batch_size,))
            grants = await cur.fetchall()

        if not grants:
            log.info("bonus_forfeit_job.completed", forfeited_count=0, job="bonus_forfeit")
            return 0

        forfeited_count = 0
        for grant_id, release_amount, consume_amount in grants:
            forfeit_amount = Decimal(str(release_amount)) - Decimal(str(consume_amount))

            # Collect pending chunks before writing anything
            async with conn.cursor() as cur:
                await cur.execute(_PENDING_CHUNKS_SQL, (grant_id,))
                pending_chunks = await cur.fetchall()

            async with conn.cursor() as cur:
                await cur.execute(_INSERT_FORFEIT_SQL, (grant_id, forfeit_amount, forfeit_amount))
                for chunk_id, chunk_amount in pending_chunks:
                    await cur.execute(_EXPIRE_CHUNK_SQL, (chunk_id,))
                    await cur.execute(
                        _INSERT_CHUNK_EXPIRY_SQL,
                        (chunk_id, grant_id, chunk_amount),
                    )

            forfeited_count += 1

        await conn.commit()

    log.info("bonus_forfeit_job.completed", forfeited_count=forfeited_count, job="bonus_forfeit")
    return forfeited_count
