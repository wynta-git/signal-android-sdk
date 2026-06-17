import json
from datetime import datetime, timezone

import aiomysql
import structlog

from shared.clients.mysql import POOL_BONUS, get_connection

from app.exceptions import DatabaseError
from app.models.bonus_configure_code import (
    BonusConfigureCodeCreate,
    BonusConfigureCodeResponse,
    BonusConfigureCodeUpdate,
)
from app.services.bonus_configure_service import _code_row_hash
from app.services.bonus_head_service import _as_dt

log = structlog.get_logger(__name__)

_INSERT_SQL = """
    INSERT INTO bonus_configure_code
        (configure_id, site_id, code, max_amount, valid_from, valid_to,
         display_title, display_description, terms_url, banner_image_url,
         badge_text, cta_text, auto_apply, display_order, display_on,
         min_display_amount, active, created_by, updated_by, row_hash)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, configure_id, site_id, code, max_amount, valid_from, valid_to,
           display_title, display_description, terms_url, banner_image_url,
           badge_text, cta_text, auto_apply, display_order, display_on,
           min_display_amount, active, created_by, updated_by, created_at, updated_at
    FROM bonus_configure_code
    WHERE id = %s
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
    "auto_apply": 13, "display_order": 14, "display_on": 15,
    "min_display_amount": 16, "active": 17,
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
        auto_apply=bool(row[13]), display_order=row[14], display_on=row[15],
        min_display_amount=row[16],
        active=bool(row[17]), created_by=row[18], updated_by=row[19],
        created_at=_as_dt(row[20]), updated_at=_as_dt(row[21]),
    )


async def get_bonus_configure_code(code_id: int) -> BonusConfigureCodeResponse:
    async with get_connection(POOL_BONUS) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SELECT_SQL, (code_id,))
            row = await cur.fetchone()
    if not row:
        raise DatabaseError(f"bonus_configure_code {code_id} not found")
    return _row_to_response(row)


async def add_bonus_configure_code(data: BonusConfigureCodeCreate) -> BonusConfigureCodeResponse:
    """
    Create a custom promo code entry for an existing configure.

    Raises:
        DatabaseError: if configure_id does not exist, code already active for the site,
                       or unexpected DB failure.
    """
    log.info("add_bonus_configure_code.start", configure_id=data.configure_id, code=data.code)

    row_hash = _code_row_hash(
        data.configure_id, data.site_id, data.code, data.created_by,
        data.max_amount, data.valid_from, data.valid_to,
    )

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
                        int(data.auto_apply), data.display_order, data.display_on,
                        data.min_display_amount, int(data.active),
                        data.created_by, data.created_by, row_hash,
                    ),
                )
                new_id: int = cur.lastrowid  # type: ignore[assignment]

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
    log.info("add_bonus_configure_code.created", code_id=response.id, configure_id=response.configure_id)
    return response


_UPDATABLE = {
    "code", "max_amount", "valid_from", "valid_to",
    "display_title", "display_description", "terms_url", "banner_image_url",
    "badge_text", "cta_text", "auto_apply", "display_order", "display_on",
    "min_display_amount", "active",
}


async def update_bonus_configure_code(
    code_id: int, data: BonusConfigureCodeUpdate
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

                # Write changelog — only include fields that actually changed
                old_vals: dict = {}
                new_vals: dict = {}
                for f in fields:
                    idx = _FIELD_IDX.get(f)
                    if idx is None:
                        continue
                    old_v = old_row[idx]
                    new_v = getattr(data, f)
                    if old_v != new_v:
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

    except DatabaseError:
        raise
    except Exception as exc:
        log.error("update_bonus_configure_code.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    if not row:
        raise DatabaseError(f"bonus_configure_code {code_id} not found")

    response = _row_to_response(row)
    log.info("update_bonus_configure_code.updated", code_id=response.id)
    return response
