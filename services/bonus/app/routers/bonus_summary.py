from decimal import Decimal

import structlog
from fastapi import APIRouter

from app.exceptions import DatabaseError
from app.models.bonus_summary import BonusSummary
from shared.clients.mysql import POOL_BONUS, get_connection

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/bonus-summary", tags=["bonus-summary"])

_SUMMARY_SQL = """
SELECT
    (SELECT COUNT(*) FROM bonus_head          WHERE site_id = %s AND active = 1) AS active_heads,
    (SELECT COUNT(*) FROM bonus_subhead        WHERE site_id = %s AND active = 1) AS active_subheads,
    (SELECT COUNT(*) FROM bonus_configure      WHERE site_id = %s AND active = 1) AS active_configures,
    (SELECT COUNT(*) FROM bonus_configure_code WHERE site_id = %s AND active = 1) AS active_codes,
    COALESCE((
        SELECT SUM(bu.budget_used)
        FROM   bonus_budget_usage bu
        WHERE  bu.site_id = %s AND bu.entity_type = 'HEAD' AND bu.period_type = 'MONTHLY'
    ), 0) AS monthly_granted,
    COALESCE((
        SELECT SUM(bl.budget_limit)
        FROM   bonus_budget_limit bl
        WHERE  bl.site_id = %s AND bl.entity_type = 'HEAD' AND bl.period_type = 'MONTHLY'
              AND bl.budget_limit IS NOT NULL
    ), 0) AS monthly_limit,
    COALESCE((
        SELECT SUM(bg.release_amount)
        FROM   bonus_grant bg
        WHERE  bg.site_id = %s
          AND  YEAR(bg.created_at) = YEAR(NOW()) AND MONTH(bg.created_at) = MONTH(NOW())
    ), 0) AS monthly_released,
    COALESCE((
        SELECT SUM(bg.consume_amount)
        FROM   bonus_grant bg
        WHERE  bg.site_id = %s
          AND  YEAR(bg.created_at) = YEAR(NOW()) AND MONTH(bg.created_at) = MONTH(NOW())
    ), 0) AS monthly_consumed,
    COALESCE((
        SELECT SUM(bc.chunk_amount)
        FROM   bonus_chunk bc
        JOIN   bonus_grant bg ON bg.id = bc.bonus_grant_id
        WHERE  bg.site_id = %s
          AND  YEAR(bg.created_at) = YEAR(NOW()) AND MONTH(bg.created_at) = MONTH(NOW())
          AND  bc.release_status = 'PENDING'
    ), 0) AS monthly_pending,
    COALESCE((
        SELECT SUM(bf.amount)
        FROM   bonus_forfeit bf
        JOIN   bonus_grant bg ON bg.id = bf.bonus_grant_id
        WHERE  bg.site_id = %s
          AND  YEAR(bf.forfeited_at) = YEAR(NOW()) AND MONTH(bf.forfeited_at) = MONTH(NOW())
    ), 0) AS monthly_forfeit
"""


@router.get("", response_model=BonusSummary)
async def get_bonus_summary(site_id: int) -> BonusSummary:
    """Return KPI counts and monthly budget summary for a site."""
    log.info("get_bonus_summary.start", site_id=site_id)
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SUMMARY_SQL, (site_id,) * 10)
                row = await cur.fetchone()
    except Exception as exc:
        log.error("get_bonus_summary.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    granted  = Decimal(str(row[4]))
    limit    = Decimal(str(row[5]))
    released = Decimal(str(row[6]))
    consumed = Decimal(str(row[7]))
    pending  = Decimal(str(row[8]))
    forfeit  = Decimal(str(row[9]))
    pct      = float(min(Decimal("100"), released / limit * 100)) if limit > 0 else 0.0

    return BonusSummary(
        active_heads=int(row[0]),
        active_subheads=int(row[1]),
        active_configures=int(row[2]),
        active_codes=int(row[3]),
        monthly_granted=granted,
        monthly_released=released,
        monthly_limit=limit,
        monthly_pct=round(pct, 1),
        monthly_consumed=consumed,
        monthly_pending=pending,
        monthly_forfeit=forfeit,
    )
