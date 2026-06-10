import aiomysql
import structlog

from shared.clients.mysql import get_connection

from app.exceptions import DatabaseError
from app.models.bonus_configure_code import (
    BonusConfigureCodeCreate,
    BonusConfigureCodeResponse,
)
from app.services.bonus_configure_service import _code_row_hash
from app.services.bonus_head_service import _as_dt

log = structlog.get_logger(__name__)

_INSERT_SQL = """
    INSERT INTO bonus_configure_code
        (configure_id, site_id, code, auto_apply, display_order, display_on,
         active, created_by, updated_by, row_hash)
    VALUES (%s, %s, %s, %s, 0, %s, %s, %s, %s, %s)
"""

_SELECT_SQL = """
    SELECT id, configure_id, site_id, code, max_amount, valid_from, valid_to,
           auto_apply, display_order, display_on, active, created_by, updated_by,
           created_at, updated_at
    FROM bonus_configure_code
    WHERE id = %s
"""

_EXISTS_CONFIGURE_SQL = "SELECT site_id FROM bonus_configure WHERE id = %s"

_EXISTS_CODE_SQL = (
    "SELECT 1 FROM bonus_configure_code "
    "WHERE site_id = %s AND code = %s AND active = 1 LIMIT 1"
)


def _row_to_response(row: tuple) -> BonusConfigureCodeResponse:
    return BonusConfigureCodeResponse(
        id=row[0], configure_id=row[1], site_id=row[2], code=row[3],
        max_amount=row[4], valid_from=_as_dt(row[5]) if row[5] else None,
        valid_to=_as_dt(row[6]) if row[6] else None,
        auto_apply=bool(row[7]), display_order=row[8], display_on=row[9],
        active=bool(row[10]), created_by=row[11], updated_by=row[12],
        created_at=_as_dt(row[13]), updated_at=_as_dt(row[14]),
    )


async def add_bonus_configure_code(data: BonusConfigureCodeCreate) -> BonusConfigureCodeResponse:
    """
    Create a custom promo code entry for an existing configure.

    Raises:
        DatabaseError: if configure_id does not exist, code already active for the site,
                       or unexpected DB failure.
    """
    if data.created_by.isdigit():
        raise DatabaseError("created_by must be a username, not a numeric id")

    log.info("add_bonus_configure_code.start", configure_id=data.configure_id, code=data.code)

    row_hash = _code_row_hash(data.configure_id, data.site_id, data.code, data.created_by)

    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(_EXISTS_CONFIGURE_SQL, (data.configure_id,))
                if await cur.fetchone() is None:
                    raise DatabaseError(f"bonus_configure {data.configure_id} not found")

                await cur.execute(_EXISTS_CODE_SQL, (data.site_id, data.code))
                if await cur.fetchone():
                    raise DatabaseError(
                        f"code '{data.code}' is already active for site {data.site_id}"
                    )

                await cur.execute(
                    _INSERT_SQL,
                    (
                        data.configure_id, data.site_id, data.code,
                        int(data.auto_apply), data.display_on, int(data.active),
                        data.created_by, data.created_by, row_hash,
                    ),
                )
                new_id: int = cur.lastrowid  # type: ignore[assignment]
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
