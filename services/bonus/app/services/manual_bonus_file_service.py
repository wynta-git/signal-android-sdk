"""
Bookkeeping for bonus_manual_bonus_file — status transitions and processing
stats for a manual-bonus CSV batch. Consumed by bonus_event_processor's
manual bonus consumer; no HTTP routes use this service.

bonus_manual_bonus_file columns:
  id, bonus_configure_code_id, original_file_name, s3_bucket, s3_key,
  file_size, uploaded_at, total_players, total_bonus_amount,
  success_players, success_amount, failed_players, failed_amount, status
"""
from __future__ import annotations

from typing import Any, Literal

import structlog

from app.exceptions import DatabaseError
from shared.clients.mysql import POOL_BONUS, get_connection

log = structlog.get_logger(__name__)

Status = Literal["PENDING", "PROCESSING", "COMPLETED", "PARTIAL_SUCCESS", "FAILED"]

_SELECT_SQL = """
    SELECT id, bonus_configure_code_id, original_file_name, s3_bucket, s3_key,
           file_size, total_players, total_bonus_amount, status
    FROM bonus_manual_bonus_file
    WHERE id = %s
"""

_MARK_PROCESSING_SQL = """
    UPDATE bonus_manual_bonus_file SET status = 'PROCESSING'
    WHERE id = %s AND status = 'PENDING'
"""

_FINALIZE_SQL = """
    UPDATE bonus_manual_bonus_file
    SET success_players = %s, success_amount = %s,
        failed_players = %s, failed_amount = %s, status = %s
    WHERE id = %s
"""

_MARK_FAILED_SQL = "UPDATE bonus_manual_bonus_file SET status = 'FAILED' WHERE id = %s"


def _row_to_dict(row: tuple) -> dict[str, Any]:
    return {
        "id": row[0],
        "bonus_configure_code_id": row[1],
        "original_file_name": row[2],
        "s3_bucket": row[3],
        "s3_key": row[4],
        "file_size": row[5],
        "total_players": row[6],
        "total_bonus_amount": row[7],
        "status": row[8],
    }


async def get_manual_bonus_file(file_id: int) -> dict[str, Any] | None:
    async with get_connection(POOL_BONUS) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SELECT_SQL, (file_id,))
            row = await cur.fetchone()
    return _row_to_dict(row) if row else None


async def mark_processing(file_id: int) -> bool:
    """Flip PENDING -> PROCESSING. Returns False if the row wasn't PENDING (already handled)."""
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_MARK_PROCESSING_SQL, (file_id,))
                await conn.commit()
                return cur.rowcount > 0
    except Exception as exc:
        log.error("manual_bonus_file.mark_processing_failed", file_id=file_id, error=str(exc))
        raise DatabaseError(str(exc)) from exc


async def finalize_stats(
    file_id: int,
    success_players: int,
    success_amount: str,
    failed_players: int,
    failed_amount: str,
    status: Status,
) -> None:
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    _FINALIZE_SQL,
                    (success_players, success_amount, failed_players, failed_amount, status, file_id),
                )
                await conn.commit()
    except Exception as exc:
        log.error("manual_bonus_file.finalize_stats_failed", file_id=file_id, error=str(exc))
        raise DatabaseError(str(exc)) from exc


async def mark_failed(file_id: int) -> None:
    """Best-effort status flip to FAILED — swallows errors, used from exception handlers."""
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_MARK_FAILED_SQL, (file_id,))
                await conn.commit()
    except Exception as exc:
        log.error("manual_bonus_file.mark_failed_failed", file_id=file_id, error=str(exc))
