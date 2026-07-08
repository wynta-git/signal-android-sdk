"""
Manual bonus CSV batch orchestration.

Given a bonus_manual_bonus_file id: download its CSV from S3, and for each
(user_id, amount) row grant a bonus via the existing handle_bonus_grant /
write_grant pipeline — no parallel grant logic. This module only does file
handling, CSV parsing, and status/stat bookkeeping.
"""
from __future__ import annotations

import csv
import io
from decimal import Decimal, InvalidOperation
from typing import Any

import aioboto3
import structlog
from redis.asyncio import Redis

from app.bonus_event_processor.bonus_grant_handler import handle_bonus_grant
from app.config import settings
from app.services.bonus_configure_code_service import get_bonus_configure_code
from app.services.bonus_release_trigger_service import get_triggers_with_config_by_site
from app.services.manual_bonus_file_service import finalize_stats, get_manual_bonus_file, mark_failed, mark_processing
from shared.clients.mysql import POOL_BONUS, get_connection
from shared.services.user import get_or_create_pam_user

log = structlog.get_logger(__name__)

_HEADER_FIRST_CELLS = {"user_id", "userid", "id", "player_id"}


async def _download_csv(s3_bucket: str, s3_key: str) -> bytes:
    session = aioboto3.Session()
    async with session.client(
        "s3",
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id or None,
        aws_secret_access_key=settings.s3_secret_access_key or None,
        endpoint_url=settings.s3_endpoint_url or None,
    ) as s3:
        obj = await s3.get_object(Bucket=s3_bucket, Key=s3_key)
        body = await obj["Body"].read()
    return body


def _parse_rows(raw: bytes) -> list[list[str]]:
    text = raw.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if r]
    if rows and rows[0] and rows[0][0].strip().lower() in _HEADER_FIRST_CELLS:
        return rows[1:]
    return rows


async def process_manual_bonus_file(redis: Redis, manual_bonus_file_id: int) -> None:
    file_row = await get_manual_bonus_file(manual_bonus_file_id)
    if file_row is None:
        log.error("manual_bonus_file_not_found", file_id=manual_bonus_file_id)
        raise ValueError(f"bonus_manual_bonus_file {manual_bonus_file_id} not found")

    if file_row["status"] != "PENDING":
        log.info("manual_bonus_file_already_handled", file_id=manual_bonus_file_id, status=file_row["status"])
        return

    if not await mark_processing(manual_bonus_file_id):
        log.info("manual_bonus_file_race_skip", file_id=manual_bonus_file_id)
        return

    try:
        await _process(redis, manual_bonus_file_id, file_row)
    except Exception as exc:
        log.error("manual_bonus_file_processing_failed", file_id=manual_bonus_file_id, error=str(exc))
        await mark_failed(manual_bonus_file_id)
        raise


async def _process(redis: Redis, manual_bonus_file_id: int, file_row: dict[str, Any]) -> None:
    if not (settings.s3_access_key_id or settings.s3_endpoint_url):
        log.error("manual_bonus_s3_not_configured", file_id=manual_bonus_file_id)
        await mark_failed(manual_bonus_file_id)
        return

    promo = await get_bonus_configure_code(file_row["bonus_configure_code_id"])
    site_id = promo.site_id

    # Bucket/key are derived from config + the same naming convention used at
    # upload time (_upload_manual_bonus_csv), not trusted from the DB row.
    s3_bucket = settings.s3_bucket
    s3_key = f"manual-bonus/{promo.code}"

    raw = await _download_csv(s3_bucket, s3_key)
    data_rows = _parse_rows(raw)

    triggers = await get_triggers_with_config_by_site(redis, site_id)
    trigger = next(
        (
            t for t in triggers
            if t.configure_id == promo.configure_id and t.release_type == "BONUS_RELEASE" and t.active
        ),
        None,
    )
    if trigger is None:
        log.error(
            "manual_bonus_no_release_trigger",
            file_id=manual_bonus_file_id,
            configure_id=promo.configure_id,
        )

    success_players = 0
    success_amount = Decimal("0.00")
    failed_players = 0
    failed_amount = Decimal("0.00")

    async with get_connection(POOL_BONUS) as conn:
        for idx, row in enumerate(data_rows):
            if len(row) < 2 or not row[0].strip():
                failed_players += 1
                continue

            user_id = row[0].strip()
            try:
                amount = Decimal(row[1].strip())
            except (InvalidOperation, ValueError):
                failed_players += 1
                continue

            if amount <= 0:
                failed_players += 1
                continue

            if trigger is None:
                failed_players += 1
                failed_amount += amount
                continue

            pam_user_id = await get_or_create_pam_user(redis, site_id, user_id)
            event_id = f"manual-bonus:{manual_bonus_file_id}:{idx}"
            props = {"site_id": site_id, "user_id": user_id, "promo_code": promo.code, "amount": str(amount)}

            try:
                grant_id = await handle_bonus_grant(
                    redis, conn, pam_user_id, props, trigger, event_id, override_grant_amount=amount,
                )
            except Exception as exc:
                log.warning(
                    "manual_bonus_grant_row_failed",
                    file_id=manual_bonus_file_id,
                    user_id=user_id,
                    row=idx,
                    error=str(exc),
                )
                grant_id = None

            if grant_id is not None:
                success_players += 1
                success_amount += amount
            else:
                failed_players += 1
                failed_amount += amount

    if success_players > 0 and failed_players == 0:
        status = "COMPLETED"
    elif success_players > 0:
        status = "PARTIAL_SUCCESS"
    else:
        status = "FAILED"

    await finalize_stats(
        manual_bonus_file_id,
        success_players, str(success_amount),
        failed_players, str(failed_amount),
        status,
    )
    log.info(
        "manual_bonus_file_processed",
        file_id=manual_bonus_file_id,
        success_players=success_players,
        failed_players=failed_players,
        status=status,
    )
