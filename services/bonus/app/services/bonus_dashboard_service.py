"""Bonus Dashboard service layer.

Router -> service function -> MySQL, mirroring the pattern used by
pam_user_bonus_service.py — bonus_summary.py's single-query style is
extended here since the dashboard needs several distinct sections.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import structlog

from app.exceptions import DatabaseError
from app.models.bonus_dashboard import (
    ActivityItem,
    AlertItem,
    BonusDashboardActivityResponse,
    BonusDashboardAlertsResponse,
    BonusDashboardBudgetHealthResponse,
    BonusDashboardSummary,
    BonusDashboardTopBonusesResponse,
    BudgetHealthProgram,
    TopBonusItem,
    TrendPoint,
)
from shared.clients.mysql import POOL_BONUS, get_connection

log = structlog.get_logger(__name__)


def resolve_window(
    start_date: str | None, end_date: str | None, window_days: int,
) -> tuple[datetime, datetime, int]:
    """Return (since, until, effective_days) from explicit dates or a rolling window."""
    if start_date and end_date:
        try:
            since = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            until = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)).replace(tzinfo=timezone.utc)
            return since, until, max(1, (until - since).days)
        except ValueError:
            pass
    now = datetime.now(timezone.utc)
    return now - timedelta(days=window_days), now, window_days


def resolve_compare_window(
    compare_start: str | None, compare_end: str | None,
    fallback_since: datetime, fallback_until: datetime,
) -> tuple[datetime, datetime]:
    if compare_start and compare_end:
        try:
            cs = datetime.strptime(compare_start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            ce = (datetime.strptime(compare_end, "%Y-%m-%d") + timedelta(days=1)).replace(tzinfo=timezone.utc)
            return cs, ce
        except ValueError:
            pass
    return fallback_since, fallback_until


def _pct(part: Decimal, whole: Decimal) -> float:
    if whole <= 0:
        return 0.0
    return round(float(part / whole * 100), 1)


def _change_pct(curr: int, prev: int) -> float | None:
    if prev <= 0:
        return None
    return round((curr - prev) / prev * 100, 1)


# ---------------------------------------------------------------------------
# Summary — Quick Stats + Promo Codes card + Monthly Bonus card + Lifecycle
# ---------------------------------------------------------------------------

_SUMMARY_SQL = """
SELECT
    (SELECT COUNT(*) FROM bonus_head           WHERE site_id = %s AND active = 1) AS active_heads,
    (SELECT COUNT(*) FROM bonus_subhead        WHERE site_id = %s AND active = 1) AS active_subheads,
    (SELECT COUNT(*) FROM bonus_configure      WHERE site_id = %s AND active = 1) AS active_configures,
    (SELECT COUNT(*) FROM bonus_configure      WHERE site_id = %s AND active = 0) AS active_configures_paused,
    (SELECT COUNT(*) FROM bonus_configure_code WHERE site_id = %s AND active = 1) AS active_codes,
    (SELECT COUNT(*) FROM bonus_configure_code
        WHERE site_id = %s AND active = 1 AND created_at >= %s AND created_at < %s
    ) AS promo_codes_created_this_period,
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
    ), 0) AS monthly_forfeit,
    COALESCE((
        SELECT SUM(bce.amount)
        FROM   bonus_chunk_expiry bce
        JOIN   bonus_grant bg ON bg.id = bce.bonus_grant_id
        WHERE  bg.site_id = %s
          AND  YEAR(bce.expired_at) = YEAR(NOW()) AND MONTH(bce.expired_at) = MONTH(NOW())
    ), 0) AS monthly_expiring,
    (SELECT COUNT(*) FROM bonus_grant bg
        WHERE bg.site_id = %s AND bg.created_at >= %s AND bg.created_at < %s) AS redemptions,
    (SELECT COUNT(*) FROM bonus_grant bg
        WHERE bg.site_id = %s AND bg.created_at >= %s AND bg.created_at < %s) AS redemptions_prev,
    COALESCE((
        SELECT AVG(bg.release_amount) FROM bonus_grant bg
        WHERE bg.site_id = %s AND bg.created_at >= %s AND bg.created_at < %s AND bg.release_amount > 0
    ), 0) AS avg_payout,
    (SELECT COUNT(DISTINCT bg.pam_user_id) FROM bonus_grant bg
        WHERE bg.site_id = %s AND bg.created_at >= %s AND bg.created_at < %s) AS active_players,
    (SELECT COUNT(DISTINCT bg.pam_user_id) FROM bonus_grant bg
        WHERE bg.site_id = %s AND bg.created_at >= %s AND bg.created_at < %s) AS active_players_prev
"""

_PROMO_CODES_TREND_SQL = """
    SELECT DATE(created_at) AS d, COUNT(*) AS cnt
    FROM bonus_configure_code
    WHERE site_id = %s AND created_at >= %s AND created_at < %s
    GROUP BY DATE(created_at)
    ORDER BY d
"""


async def get_dashboard_summary(
    site_id: int,
    since: datetime, until: datetime,
    comp_since: datetime, comp_until: datetime,
    window_days: int,
) -> BonusDashboardSummary:
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SUMMARY_SQL, (
                    site_id, site_id, site_id, site_id, site_id,
                    site_id, since, until,
                    site_id, site_id, site_id, site_id, site_id, site_id, site_id,
                    site_id, since, until,
                    site_id, comp_since, comp_until,
                    site_id, since, until,
                    site_id, since, until,
                    site_id, comp_since, comp_until,
                ))
                row = await cur.fetchone()

                await cur.execute(_PROMO_CODES_TREND_SQL, (site_id, since, until))
                trend_rows = await cur.fetchall()
    except Exception as exc:
        log.error("bonus_dashboard.summary.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    granted = Decimal(str(row[6]))
    limit_ = Decimal(str(row[7]))
    released = Decimal(str(row[8]))
    consumed = Decimal(str(row[9]))
    pending = Decimal(str(row[10]))
    forfeit = Decimal(str(row[11]))
    expiring = Decimal(str(row[12]))
    redemptions = int(row[13])
    redemptions_prev = int(row[14])
    avg_payout = Decimal(str(row[15]))
    active_players = int(row[16])
    active_players_prev = int(row[17])

    return BonusDashboardSummary(
        window_days=window_days,
        active_promo_codes=int(row[4]),
        promo_codes_created_this_period=int(row[5]),
        active_configures=int(row[2]),
        active_configures_paused=int(row[3]),
        active_heads=int(row[0]),
        active_subheads=int(row[1]),
        redemptions=redemptions,
        redemptions_change_pct=_change_pct(redemptions, redemptions_prev),
        avg_payout=avg_payout,
        active_players=active_players,
        active_players_change_pct=_change_pct(active_players, active_players_prev),
        monthly_granted=granted,
        monthly_limit=limit_,
        monthly_pct=float(min(Decimal("100"), released / limit_ * 100)) if limit_ > 0 else 0.0,
        monthly_released=released,
        monthly_consumed=consumed,
        monthly_pending=pending,
        monthly_forfeit=forfeit,
        monthly_expiring=expiring,
        released_pct=_pct(released, granted),
        pending_pct=_pct(pending, granted),
        consumed_pct=_pct(consumed, granted),
        expiry_pct=_pct(expiring, granted),
        forfeit_pct=_pct(forfeit, granted),
        promo_codes_trend=[TrendPoint(date=r[0], count=int(r[1])) for r in trend_rows],
    )


# ---------------------------------------------------------------------------
# Top Performing Bonuses
# ---------------------------------------------------------------------------

_TOP_BONUSES_COUNT_SQL = "SELECT COUNT(*) FROM bonus_configure WHERE site_id = %s"

_TOP_BONUSES_SQL = """
    SELECT
        c.id, c.name, sh.name AS subtitle, sh.name AS type, c.active,
        COUNT(bg.id) AS redemptions,
        COUNT(DISTINCT bg.pam_user_id) AS players,
        COALESCE(AVG(bg.release_amount), 0) AS avg_payout
    FROM bonus_configure c
    JOIN bonus_subhead sh ON sh.id = c.subhead_id
    LEFT JOIN bonus_grant bg
           ON bg.configure_id = c.id
          AND bg.created_at >= %s AND bg.created_at < %s
    WHERE c.site_id = %s
    GROUP BY c.id, c.name, sh.name, c.active
    ORDER BY redemptions DESC, c.id
    LIMIT %s OFFSET %s
"""


async def get_top_bonuses(
    site_id: int, since: datetime, until: datetime, limit: int, offset: int,
) -> BonusDashboardTopBonusesResponse:
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_TOP_BONUSES_COUNT_SQL, (site_id,))
                total = (await cur.fetchone())[0]

                await cur.execute(_TOP_BONUSES_SQL, (since, until, site_id, limit, offset))
                rows = await cur.fetchall()

                configure_ids = [r[0] for r in rows]
                trends: dict[int, list[TrendPoint]] = {cid: [] for cid in configure_ids}
                if configure_ids:
                    placeholders = ",".join(["%s"] * len(configure_ids))
                    await cur.execute(
                        f"""
                        SELECT configure_id, DATE(created_at) AS d, COUNT(*) AS cnt
                        FROM bonus_grant
                        WHERE configure_id IN ({placeholders})
                          AND created_at >= %s AND created_at < %s
                        GROUP BY configure_id, DATE(created_at)
                        ORDER BY configure_id, d
                        """,
                        (*configure_ids, since, until),
                    )
                    for cid, d, cnt in await cur.fetchall():
                        trends[cid].append(TrendPoint(date=d, count=int(cnt)))
    except Exception as exc:
        log.error("bonus_dashboard.top_bonuses.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    bonuses = [
        TopBonusItem(
            configure_id=r[0],
            name=r[1],
            subtitle=r[2],
            type=r[3],
            trend=trends.get(r[0], []),
            redemptions=int(r[5]),
            players=int(r[6]),
            avg_payout=Decimal(str(r[7])),
            status="Active" if r[4] else "Paused",
        )
        for r in rows
    ]
    return BonusDashboardTopBonusesResponse(total=total, limit=limit, offset=offset, bonuses=bonuses)


# ---------------------------------------------------------------------------
# Recent Activity — union of credited / expired / forfeited events
# ---------------------------------------------------------------------------

_ACTIVITY_COUNT_SQL = """
    SELECT
        (SELECT COUNT(*) FROM bonus_grant WHERE site_id = %s)
      + (SELECT COUNT(*) FROM bonus_chunk_expiry bce
            JOIN bonus_grant bg ON bg.id = bce.bonus_grant_id WHERE bg.site_id = %s)
      + (SELECT COUNT(*) FROM bonus_forfeit bf
            JOIN bonus_grant bg ON bg.id = bf.bonus_grant_id WHERE bg.site_id = %s)
"""

_ACTIVITY_SQL = """
    (SELECT 'CREDITED' AS event_type, bg.pam_user_id, bg.configure_id, c.name AS configure_name,
            bg.grant_amount AS amount, bg.created_at AS occurred_at
     FROM bonus_grant bg
     JOIN bonus_configure c ON c.id = bg.configure_id
     WHERE bg.site_id = %s)
    UNION ALL
    (SELECT 'EXPIRED' AS event_type, bg.pam_user_id, bg.configure_id, c.name AS configure_name,
            bce.amount, bce.expired_at AS occurred_at
     FROM bonus_chunk_expiry bce
     JOIN bonus_grant bg ON bg.id = bce.bonus_grant_id
     JOIN bonus_configure c ON c.id = bg.configure_id
     WHERE bg.site_id = %s)
    UNION ALL
    (SELECT 'FORFEITED' AS event_type, bg.pam_user_id, bg.configure_id, c.name AS configure_name,
            bf.amount, bf.forfeited_at AS occurred_at
     FROM bonus_forfeit bf
     JOIN bonus_grant bg ON bg.id = bf.bonus_grant_id
     JOIN bonus_configure c ON c.id = bg.configure_id
     WHERE bg.site_id = %s)
    ORDER BY occurred_at DESC
    LIMIT %s OFFSET %s
"""


async def get_recent_activity(site_id: int, limit: int, offset: int) -> BonusDashboardActivityResponse:
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_ACTIVITY_COUNT_SQL, (site_id, site_id, site_id))
                total = (await cur.fetchone())[0]

                await cur.execute(_ACTIVITY_SQL, (site_id, site_id, site_id, limit, offset))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("bonus_dashboard.recent_activity.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    activities = [
        ActivityItem(
            event_type=r[0],
            pam_user_id=str(r[1]),
            configure_id=r[2],
            configure_name=r[3],
            amount=Decimal(str(r[4])),
            occurred_at=r[5].isoformat() if hasattr(r[5], "isoformat") else str(r[5]),
        )
        for r in rows
    ]
    return BonusDashboardActivityResponse(total=total, limit=limit, offset=offset, activities=activities)


# ---------------------------------------------------------------------------
# Needs Attention — expiring promo codes + budget-critical entities
# ---------------------------------------------------------------------------

_ALERTS_EXPIRING_CODES_SQL = """
    SELECT cc.id, cc.code, cc.display_title, cc.valid_to, c.name AS configure_name
    FROM bonus_configure_code cc
    JOIN bonus_configure c ON c.id = cc.configure_id
    WHERE cc.site_id = %s AND cc.active = 1
      AND cc.valid_to IS NOT NULL
      AND cc.valid_to BETWEEN NOW() AND NOW() + INTERVAL 7 DAY
    ORDER BY cc.valid_to
"""

_ALERTS_BUDGET_CRITICAL_SQL = """
    SELECT bl.entity_id, h.name AS head_name, bu.budget_used, bl.budget_limit
    FROM bonus_budget_limit bl
    JOIN bonus_budget_usage bu
      ON  bu.entity_type = bl.entity_type AND bu.entity_id = bl.entity_id AND bu.period_type = bl.period_type
    JOIN bonus_head h ON h.id = bl.entity_id
    WHERE bl.entity_type = 'HEAD' AND bl.site_id = %s AND bl.period_type = 'MONTHLY'
      AND bl.budget_limit IS NOT NULL AND bl.budget_limit > 0
      AND bu.budget_used / bl.budget_limit >= 0.90
    ORDER BY (bu.budget_used / bl.budget_limit) DESC
"""


async def get_dashboard_alerts(site_id: int) -> BonusDashboardAlertsResponse:
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_ALERTS_EXPIRING_CODES_SQL, (site_id,))
                expiring_rows = await cur.fetchall()

                await cur.execute(_ALERTS_BUDGET_CRITICAL_SQL, (site_id,))
                budget_rows = await cur.fetchall()
    except Exception as exc:
        log.error("bonus_dashboard.alerts.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    alerts: list[AlertItem] = []
    for code_id, code, display_title, valid_to, configure_name in expiring_rows:
        days_left = max(0, (valid_to - datetime.now()).days) if valid_to else 0
        alerts.append(AlertItem(
            severity="warning",
            title=f"1 bonus expiring within 7 days" if len(expiring_rows) == 1
                  else f"{len(expiring_rows)} bonuses expiring within 7 days",
            subtitle=f"{display_title or code} — {configure_name}",
            entity_type="BONUS_CONFIGURE_CODE",
            entity_id=code_id,
        ))

    for entity_id, head_name, used, limit_ in budget_rows:
        pct = round(float(Decimal(str(used)) / Decimal(str(limit_)) * 100), 0)
        alerts.append(AlertItem(
            severity="critical",
            title=f"{head_name} monthly budget critical",
            subtitle=f"{pct:.0f}% of {limit_} used",
            entity_type="HEAD",
            entity_id=entity_id,
        ))

    return BonusDashboardAlertsResponse(alerts=alerts)


# ---------------------------------------------------------------------------
# Budget Health — HEAD-level monthly + daily usage, with owner
# ---------------------------------------------------------------------------

_BUDGET_HEALTH_SQL = """
    SELECT
        h.id, h.name,
        COALESCE((
            SELECT o.username FROM bonus_owners o
            WHERE o.entity_type = 'HEAD' AND o.entity_id = h.id AND o.active = 1
            ORDER BY FIELD(o.role, 'OPS_LEAD', 'CAMPAIGN_MANAGER', 'FINANCE_APPROVER', 'ESCALATION_CONTACT'), o.id
            LIMIT 1
        ), h.owner) AS owner,
        COALESCE((
            SELECT bu.budget_used FROM bonus_budget_usage bu
            WHERE bu.entity_type = 'HEAD' AND bu.entity_id = h.id AND bu.period_type = 'MONTHLY'
        ), 0) AS monthly_used,
        (
            SELECT bl.budget_limit FROM bonus_budget_limit bl
            WHERE bl.entity_type = 'HEAD' AND bl.entity_id = h.id AND bl.period_type = 'MONTHLY'
        ) AS monthly_limit,
        COALESCE((
            SELECT bu.budget_used FROM bonus_budget_usage bu
            WHERE bu.entity_type = 'HEAD' AND bu.entity_id = h.id AND bu.period_type = 'DAILY'
        ), 0) AS daily_used,
        (
            SELECT bl.budget_limit FROM bonus_budget_limit bl
            WHERE bl.entity_type = 'HEAD' AND bl.entity_id = h.id AND bl.period_type = 'DAILY'
        ) AS daily_limit
    FROM bonus_head h
    WHERE h.site_id = %s AND h.active = 1
    ORDER BY h.name
"""


async def get_budget_health(site_id: int) -> BonusDashboardBudgetHealthResponse:
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_BUDGET_HEALTH_SQL, (site_id,))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("bonus_dashboard.budget_health.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    programs = []
    for entity_id, name, owner, monthly_used, monthly_limit, daily_used, daily_limit in rows:
        monthly_used_d = Decimal(str(monthly_used))
        daily_used_d = Decimal(str(daily_used))
        monthly_limit_d = Decimal(str(monthly_limit)) if monthly_limit is not None else None
        daily_limit_d = Decimal(str(daily_limit)) if daily_limit is not None else None
        programs.append(BudgetHealthProgram(
            entity_type="HEAD",
            entity_id=entity_id,
            name=name,
            owner=owner,
            monthly_used=monthly_used_d,
            monthly_limit=monthly_limit_d,
            monthly_pct=_pct(monthly_used_d, monthly_limit_d) if monthly_limit_d else None,
            daily_used=daily_used_d,
            daily_limit=daily_limit_d,
            daily_pct=_pct(daily_used_d, daily_limit_d) if daily_limit_d else None,
        ))
    return BonusDashboardBudgetHealthResponse(programs=programs)
