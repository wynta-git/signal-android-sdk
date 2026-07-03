import structlog
from fastapi import APIRouter

from app.exceptions import DatabaseError
from app.models.bonus_spend import SpendPeriod
from shared.clients.mysql import POOL_BONUS, get_connection

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/bonus-spend", tags=["bonus-spend"])

_SELECT_SPEND_SQL = """
    SELECT period_type, period_start, period_end, consume_count, total_amount
    FROM   bonus_spend
    WHERE  entity_type = %s AND entity_id = %s
    ORDER  BY period_type, period_start DESC
"""


@router.get("", response_model=list[SpendPeriod])
async def get_bonus_spend(entity_type: str, entity_id: int) -> list[SpendPeriod]:
    """Return all bonus_spend rows for an entity (HEAD / SUBHEAD / CONFIGURE)."""
    log.info("get_bonus_spend.start", entity_type=entity_type, entity_id=entity_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SELECT_SPEND_SQL, (entity_type.upper(), entity_id))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("get_bonus_spend.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc
    return [
        SpendPeriod(
            period_type=r[0],
            period_start=r[1],
            period_end=r[2],
            consume_count=r[3],
            total_amount=r[4],
        )
        for r in rows
    ]
