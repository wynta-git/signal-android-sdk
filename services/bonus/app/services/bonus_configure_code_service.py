import json
from datetime import datetime, timezone

import aioboto3
import aiomysql
import structlog
from aiokafka import AIOKafkaProducer
from botocore.exceptions import ClientError
from redis.asyncio import Redis
from starlette.datastructures import UploadFile

from shared.clients.mysql import POOL_BONUS, get_connection
from app.config import settings
from app.services.bonus_cache import bust_auto_apply_code_cache, bust_code_cache

from app.exceptions import DatabaseError
from app.models.bonus_configure_code import (
    BonusConfigureCodeCreate,
    BonusConfigureCodeResponse,
    BonusConfigureCodeUpdate,
)
from app.services.bonus_configure_service import _code_row_hash
from app.services.bonus_head_service import _as_dt

log = structlog.get_logger(__name__)


def code_validity_sql(alias: str = "") -> str:
    """SQL fragment: is this bonus_configure_code row active and within its validity window."""
    p = f"{alias}." if alias else ""
    return (
        f"{p}active = 1 "
        f"AND ({p}valid_from IS NULL OR {p}valid_from <= NOW()) "
        f"AND ({p}valid_to   IS NULL OR {p}valid_to   >= NOW())"
    )


_INSERT_SQL = """
    INSERT INTO bonus_configure_code
        (configure_id, site_id, code, max_amount, valid_from, valid_to,
         display_title, display_description, terms_url, banner_image_url,
         badge_text, cta_text, auto_apply, system_auto_apply, display_order, display_on,
         min_display_amount, active, created_by, updated_by, row_hash, is_manual_bonus)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, configure_id, site_id, code, max_amount, valid_from, valid_to,
           display_title, display_description, terms_url, banner_image_url,
           badge_text, cta_text, auto_apply, system_auto_apply, display_order, display_on,
           min_display_amount, active, created_by, updated_by, created_at, updated_at, is_manual_bonus
    FROM bonus_configure_code
    WHERE id = %s
"""

_MANUAL_BONUS_FILE_INSERT_SQL = """
    INSERT INTO bonus_manual_bonus_file
        (bonus_configure_code_id, original_file_name, s3_bucket, s3_key, file_size,
         total_players, total_bonus_amount)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
"""

_CHANGELOG_INSERT_SQL = """
    INSERT INTO bonus_change_log
        (table_name, action, entity_id, site_id, changed_by, changed_at, old_values, new_values)
    VALUES ('bonus_configure_code', %s, %s, %s, %s, %s, %s, %s)
"""

# Maps updatable field name → index in _SELECT_SQL result tuple
_FIELD_IDX: dict[str, int] = {
    "code": 3, "max_amount": 4, "valid_from": 5, "valid_to": 6,
    "display_title": 7, "display_description": 8, "terms_url": 9,
    "banner_image_url": 10, "badge_text": 11, "cta_text": 12,
    "auto_apply": 13, "system_auto_apply": 14, "display_order": 15, "display_on": 16,
    "min_display_amount": 17, "active": 18,
}

_EXISTS_CONFIGURE_SQL = "SELECT site_id FROM bonus_configure WHERE id = %s"

_EXISTS_CODE_SQL = (
    "SELECT 1 FROM bonus_configure_code "
    "WHERE site_id = %s AND code = %s AND id != %s LIMIT 1"
)


def _row_to_response(row: tuple) -> BonusConfigureCodeResponse:
    return BonusConfigureCodeResponse(
        id=row[0], configure_id=row[1], site_id=row[2], code=row[3],
        max_amount=row[4],
        valid_from=_as_dt(row[5]) if row[5] else None,
        valid_to=_as_dt(row[6]) if row[6] else None,
        display_title=row[7], display_description=row[8],
        terms_url=row[9], banner_image_url=row[10],
        badge_text=row[11], cta_text=row[12],
        auto_apply=bool(row[13]),
        system_auto_apply=bool(row[14]) if row[14] is not None else None,
        display_order=row[15], display_on=row[16],
        min_display_amount=row[17],
        active=bool(row[18]), created_by=row[19], updated_by=row[20],
        created_at=_as_dt(row[21]), updated_at=_as_dt(row[22]),
        is_manual_bonus=bool(row[23]),
    )


async def _create_bucket_if_missing(s3, exc: ClientError) -> bool:
    """Returns True if exc was NoSuchBucket and the bucket was created (or already existed)."""
    if exc.response.get("Error", {}).get("Code") != "NoSuchBucket":
        return False

    create_kwargs: dict[str, object] = {"Bucket": settings.s3_bucket}
    if settings.s3_region and settings.s3_region != "us-east-1":
        create_kwargs["CreateBucketConfiguration"] = {"LocationConstraint": settings.s3_region}

    try:
        await s3.create_bucket(**create_kwargs)
        log.info("s3_bucket_created", bucket=settings.s3_bucket, region=settings.s3_region)
    except ClientError as create_exc:
        # Someone else (or a concurrent request) already created it — fine, proceed.
        if create_exc.response.get("Error", {}).get("Code") == "BucketAlreadyOwnedByYou":
            return True
        log.warning("s3_bucket_create_failed", bucket=settings.s3_bucket, error=str(create_exc))
        return False
    return True


async def _upload_manual_bonus_csv(csv_file: UploadFile, code: str) -> tuple[str | None, str | None, int]:
    """Uploads a manual-bonus CSV to S3 (if configured), creating the bucket if it doesn't exist yet.

    Returns (bucket, key, size).
    """
    raw = await csv_file.read()
    size = len(raw)

    s3_configured = bool(settings.s3_access_key_id or settings.s3_endpoint_url)
    if not s3_configured:
        log.info("s3_not_configured_skipping_manual_bonus_upload", code=code)
        return None, None, size

    s3_key = f"manual-bonus/{code}"
    session = aioboto3.Session()
    async with session.client(
        "s3",
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id or None,
        aws_secret_access_key=settings.s3_secret_access_key or None,
        endpoint_url=settings.s3_endpoint_url or None,
    ) as s3:
        try:
            await s3.put_object(Bucket=settings.s3_bucket, Key=s3_key, Body=raw, ContentType="text/csv")
        except ClientError as exc:
            if not await _create_bucket_if_missing(s3, exc):
                log.warning("s3_upload_failed", code=code, error=str(exc))
                return None, None, size
            try:
                await s3.put_object(Bucket=settings.s3_bucket, Key=s3_key, Body=raw, ContentType="text/csv")
            except Exception as retry_exc:
                log.warning("s3_upload_failed", code=code, error=str(retry_exc))
                return None, None, size
        except Exception as exc:
            log.warning("s3_upload_failed", code=code, error=str(exc))
            return None, None, size

    return settings.s3_bucket, s3_key, size


async def get_bonus_configure_code(code_id: int) -> BonusConfigureCodeResponse:
    async with get_connection(POOL_BONUS) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SELECT_SQL, (code_id,))
            row = await cur.fetchone()
    if not row:
        raise DatabaseError(f"bonus_configure_code {code_id} not found")
    return _row_to_response(row)


async def add_bonus_configure_code(
    data: BonusConfigureCodeCreate,
    redis: Redis | None = None,
    csv_file: UploadFile | None = None,
    total_players: int | None = None,
    total_bonus_amount: str | None = None,
    kafka_producer: AIOKafkaProducer | None = None,
) -> BonusConfigureCodeResponse:
    """
    Create a custom promo code entry for an existing configure.

    When data.is_manual_bonus is set, csv_file is uploaded to S3 (if configured)
    and a linked bonus_manual_bonus_file row is written in the same transaction,
    seeded with total_players/total_bonus_amount parsed from the filename. Once
    committed, a {"manual_bonus_file_id": <id>} event is published to
    settings.kafka_manual_bonus_topic (best-effort — a publish failure never
    fails the request) so bonus_event_processor can grant the CSV's players.

    Raises:
        DatabaseError: if configure_id does not exist, code already active for the site,
                       or unexpected DB failure.
    """
    log.info("add_bonus_configure_code.start", configure_id=data.configure_id, code=data.code)

    row_hash = _code_row_hash(
        data.configure_id, data.site_id, data.code, data.created_by,
        data.max_amount, data.valid_from, data.valid_to,
    )

    s3_bucket = s3_key = None
    file_size = 0
    if data.is_manual_bonus and csv_file is not None:
        s3_bucket, s3_key, file_size = await _upload_manual_bonus_csv(csv_file, data.code)

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_EXISTS_CONFIGURE_SQL, (data.configure_id,))
                if await cur.fetchone() is None:
                    raise DatabaseError(f"bonus_configure {data.configure_id} not found")

                await cur.execute(_EXISTS_CODE_SQL, (data.site_id, data.code, 0))
                if await cur.fetchone():
                    raise DatabaseError(
                        f"code '{data.code}' is already active for site {data.site_id}"
                    )

                await cur.execute(
                    _INSERT_SQL,
                    (
                        data.configure_id, data.site_id, data.code,
                        data.max_amount, data.valid_from, data.valid_to,
                        data.display_title, data.display_description,
                        data.terms_url, data.banner_image_url,
                        data.badge_text, data.cta_text,
                        int(data.auto_apply),
                        int(data.system_auto_apply) if data.system_auto_apply is not None else None,
                        data.display_order, data.display_on,
                        data.min_display_amount, int(data.active),
                        data.created_by, data.created_by, row_hash,
                        int(data.is_manual_bonus),
                    ),
                )
                new_id: int = cur.lastrowid  # type: ignore[assignment]

                manual_bonus_file_id: int | None = None
                if data.is_manual_bonus and csv_file is not None:
                    await cur.execute(
                        _MANUAL_BONUS_FILE_INSERT_SQL,
                        (
                            new_id, csv_file.filename, s3_bucket, s3_key, file_size,
                            total_players or 0, total_bonus_amount or "0",
                        ),
                    )
                    manual_bonus_file_id = cur.lastrowid

                now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
                new_vals = {
                    "code": data.code,
                    "max_amount": str(data.max_amount) if data.max_amount is not None else None,
                    "valid_from": str(data.valid_from) if data.valid_from is not None else None,
                    "valid_to": str(data.valid_to) if data.valid_to is not None else None,
                    "display_title": data.display_title,
                    "active": int(data.active),
                }
                await cur.execute(
                    _CHANGELOG_INSERT_SQL,
                    ('INSERT', data.configure_id, data.site_id, data.created_by,
                     now_utc, None, json.dumps(new_vals)),
                )
                await conn.commit()

                await cur.execute(_SELECT_SQL, (new_id,))
                row = await cur.fetchone()

    except DatabaseError:
        raise
    except aiomysql.IntegrityError as exc:
        raise DatabaseError(str(exc)) from exc
    except Exception as exc:
        log.error("add_bonus_configure_code.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    if row is None:
        raise DatabaseError("Insert succeeded but row could not be retrieved")

    response = _row_to_response(row)
    if redis:
        await bust_auto_apply_code_cache(redis, response.configure_id)

    if manual_bonus_file_id is not None and kafka_producer is not None:  # type: ignore[possibly-undefined]
        try:
            await kafka_producer.send(
                settings.kafka_manual_bonus_topic,
                key=str(manual_bonus_file_id).encode(),
                value=json.dumps({"manual_bonus_file_id": manual_bonus_file_id}).encode(),
            )
        except Exception as exc:
            log.warning(
                "add_bonus_configure_code.manual_bonus_publish_failed",
                manual_bonus_file_id=manual_bonus_file_id,
                error=str(exc),
            )

    log.info("add_bonus_configure_code.created", code_id=response.id, configure_id=response.configure_id)
    return response


_UPDATABLE = {
    "code", "max_amount", "valid_from", "valid_to",
    "display_title", "display_description", "terms_url", "banner_image_url",
    "badge_text", "cta_text", "auto_apply", "system_auto_apply", "display_order", "display_on",
    "min_display_amount", "active",
}


async def update_bonus_configure_code(
    code_id: int, data: BonusConfigureCodeUpdate, redis: Redis | None = None
) -> BonusConfigureCodeResponse:
    """Patch a bonus_configure_code row."""
    log.info("update_bonus_configure_code.start", code_id=code_id)

    fields = data.model_fields_set & _UPDATABLE
    if not fields:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SQL, (code_id,))
                row = await cur.fetchone()
        if not row:
            raise DatabaseError(f"bonus_configure_code {code_id} not found")
        return _row_to_response(row)

    set_clauses = ", ".join(f"{f} = %s" for f in sorted(fields))
    set_clauses += ", updated_by = %s"
    update_sql = f"UPDATE bonus_configure_code SET {set_clauses} WHERE id = %s"

    values = []
    for f in sorted(fields):
        v = getattr(data, f)
        values.append(int(v) if isinstance(v, bool) else v)
    values.append(data.updated_by)
    values.append(code_id)

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                # Fetch old row first — needed for duplicate guard, changelog, and 404 check
                await cur.execute(_SELECT_SQL, (code_id,))
                old_row = await cur.fetchone()
                if not old_row:
                    raise DatabaseError(f"bonus_configure_code {code_id} not found")
                configure_id: int = old_row[1]
                site_id: int = old_row[2]
                old_code: str = old_row[3]

                # Duplicate code guard (skip for current row)
                if "code" in fields or "active" in fields:
                    new_code = data.code if data.code is not None else old_code
                    await cur.execute(_EXISTS_CODE_SQL, (site_id, new_code, code_id))
                    if await cur.fetchone():
                        raise DatabaseError(
                            f"code '{new_code}' is already active for site {site_id}"
                        )

                await cur.execute(update_sql, values)

                # Write changelog — only include fields that actually changed.
                # Nullable-boolean columns (e.g. system_auto_apply) store NULL and 0
                # as the same "off" state, so compare them as normalized bools —
                # otherwise every edit of an untouched NULL field logs a false change.
                old_vals: dict = {}
                new_vals: dict = {}
                for f in fields:
                    idx = _FIELD_IDX.get(f)
                    if idx is None:
                        continue
                    old_v = old_row[idx]
                    new_v = getattr(data, f)
                    if f == "system_auto_apply":
                        changed = bool(old_v) != bool(new_v)
                    else:
                        changed = old_v != new_v
                    if changed:
                        old_vals[f] = str(old_v) if old_v is not None else None
                        new_vals[f] = str(new_v) if new_v is not None else None
                if old_vals:
                    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
                    await cur.execute(
                        _CHANGELOG_INSERT_SQL,
                        ('UPDATE', configure_id, site_id, data.updated_by, now_utc,
                         json.dumps(old_vals), json.dumps(new_vals)),
                    )

                await conn.commit()
                await cur.execute(_SELECT_SQL, (code_id,))
                row = await cur.fetchone()

                await cur.execute(
                    "SELECT wager_chip_type FROM bonus_configure WHERE id = %s",
                    (configure_id,),
                )
                chip_row = await cur.fetchone()
                chip_type_str: str | None = chip_row[0] if chip_row else None

    except DatabaseError:
        raise
    except Exception as exc:
        log.error("update_bonus_configure_code.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    if not row:
        raise DatabaseError(f"bonus_configure_code {code_id} not found")

    if redis:
        if chip_type_str:
            bust_codes = list({old_code})  # type: ignore[possibly-undefined]
            if "code" in fields and data.code is not None:  # type: ignore[possibly-undefined]
                bust_codes.append(data.code)
            await bust_code_cache(redis, bust_codes, [chip_type_str])
        await bust_auto_apply_code_cache(redis, configure_id)  # type: ignore[possibly-undefined]

    response = _row_to_response(row)
    log.info("update_bonus_configure_code.updated", code_id=response.id)
    return response
