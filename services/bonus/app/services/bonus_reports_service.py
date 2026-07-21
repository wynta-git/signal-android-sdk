"""Bonus Reports service layer.

Router -> service function -> MySQL, mirroring bonus_dashboard_service.py's
established pattern (typed Pydantic response models, resolve_window /
resolve_compare_window reused directly rather than re-implemented).

GGR and redemption-rate fields have no real data source anywhere in this
codebase (no wallet/game/settlement service exists) — they are returned as
TrackedValue(value=None, tracked=False), matching campaign-engine's
_UNTRACKED sentinel convention rather than being fabricated or approximated.
"""
from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

import structlog

from app.exceptions import DatabaseError
from app.models.bonus_reports import (
    BonusPerformanceResponse,
    BonusPerformanceRow,
    BudgetSpendResponse,
    BudgetSpendRow,
    CustomReportResponse,
    CustomReportRow,
    PlayerActivityResponse,
    PlayerActivityRow,
    TrackedValue,
)
from app.services.bonus_dashboard_service import resolve_compare_window, resolve_window  # noqa: F401 (re-exported)
from shared.clients.mysql import POOL_BONUS, POOL_COMMON, get_connection

log = structlog.get_logger(__name__)

_UNTRACKED = TrackedValue(value=None, tracked=False)


def _money(d: Decimal) -> Decimal:
    """Round a Decimal to exactly 2 places — every amount/average field in the
    Reports API must render as e.g. 207.14, never 207.1428571428571..."""
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _pct(value: float) -> float:
    """Round a percentage to exactly 2 decimal places."""
    return round(value, 2)


def _status_for(active: int, end_date: datetime) -> str:
    if end_date < datetime.now():
        return "Expired"
    return "Active" if active else "Paused"


# ---------------------------------------------------------------------------
# Bonus Performance
# ---------------------------------------------------------------------------

_PERFORMANCE_KPI_SQL = """
    SELECT
        COUNT(*) AS redemptions,
        COUNT(DISTINCT pam_user_id) AS unique_players,
        COALESCE(AVG(release_amount), 0) AS avg_payout
    FROM bonus_grant
    WHERE site_id = %s AND created_at >= %s AND created_at < %s AND release_amount > 0
"""

_PERFORMANCE_COUNT_SQL = "SELECT COUNT(*) FROM bonus_configure WHERE site_id = %s"

_PERFORMANCE_ROWS_SQL = """
    SELECT
        c.id, c.name, h.name AS programme, sh.name AS type, c.active, c.end_date,
        COUNT(bg.id) AS redemptions,
        COUNT(DISTINCT bg.pam_user_id) AS players,
        COALESCE(AVG(bg.release_amount), 0) AS avg_payout
    FROM bonus_configure c
    JOIN bonus_subhead sh ON sh.id = c.subhead_id
    JOIN bonus_head h ON h.id = sh.head_id
    LEFT JOIN bonus_grant bg
           ON bg.configure_id = c.id
          AND bg.created_at >= %s AND bg.created_at < %s
    WHERE c.site_id = %s
    GROUP BY c.id, c.name, h.name, sh.name, c.active, c.end_date
    ORDER BY redemptions DESC, c.id
    LIMIT %s OFFSET %s
"""


async def get_bonus_performance_report(
    site_id: int,
    table_since: datetime, table_until: datetime,
    kpi_since: datetime, kpi_until: datetime,
    window_days: int,
    limit: int, offset: int,
) -> BonusPerformanceResponse:
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_PERFORMANCE_KPI_SQL, (site_id, kpi_since, kpi_until))
                redemptions, unique_players, avg_payout = await cur.fetchone()

                await cur.execute(_PERFORMANCE_COUNT_SQL, (site_id,))
                total = (await cur.fetchone())[0]

                await cur.execute(_PERFORMANCE_ROWS_SQL, (table_since, table_until, site_id, limit, offset))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("bonus_reports.performance.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    return BonusPerformanceResponse(
        window_days=window_days,
        redemptions=int(redemptions),
        unique_players=int(unique_players),
        avg_payout=_money(Decimal(str(avg_payout))),
        ggr_vs_cost=_UNTRACKED,
        total=total,
        limit=limit,
        offset=offset,
        rows=[
            BonusPerformanceRow(
                configure_id=r[0],
                name=r[1],
                programme=r[2],
                type=r[3],
                redemptions=int(r[6]),
                players=int(r[7]),
                avg_payout=_money(Decimal(str(r[8]))),
                redeem_rate=_UNTRACKED,
                status=_status_for(r[4], r[5]),
            )
            for r in rows
        ],
    )


# ---------------------------------------------------------------------------
# Budget & Spend
# ---------------------------------------------------------------------------

_SPEND_KPI_SQL = """
    SELECT COUNT(*) AS redemption_count, COALESCE(SUM(release_amount), 0) AS total_cost
    FROM bonus_grant
    WHERE site_id = %s AND created_at >= %s AND created_at < %s AND release_amount > 0
"""

_SPEND_BUDGET_SQL = """
    SELECT
        COALESCE((SELECT SUM(bu.budget_used) FROM bonus_budget_usage bu
                  WHERE bu.site_id = %s AND bu.entity_type = 'HEAD' AND bu.period_type = 'MONTHLY'), 0),
        COALESCE((SELECT SUM(bl.budget_limit) FROM bonus_budget_limit bl
                  WHERE bl.site_id = %s AND bl.entity_type = 'HEAD' AND bl.period_type = 'MONTHLY'
                        AND bl.budget_limit IS NOT NULL), 0)
"""

_SPEND_COUNT_SQL = "SELECT COUNT(*) FROM bonus_subhead WHERE site_id = %s"

_SPEND_ROWS_SQL = """
    SELECT
        sh.id, sh.name, sh.description, h.name AS programme,
        COUNT(DISTINCT c.id) AS bonuses,
        (SELECT bl.budget_limit FROM bonus_budget_limit bl
         WHERE bl.entity_type = 'SUBHEAD' AND bl.entity_id = sh.id AND bl.period_type = 'MONTHLY') AS budget_limit,
        COALESCE((SELECT bu.budget_used FROM bonus_budget_usage bu
                  WHERE bu.entity_type = 'SUBHEAD' AND bu.entity_id = sh.id AND bu.period_type = 'MONTHLY'), 0) AS used,
        COALESCE(SUM(CASE WHEN bg.created_at >= %s AND bg.created_at < %s
                          THEN bg.release_amount ELSE 0 END), 0) AS bonus_cost,
        COUNT(CASE WHEN bg.created_at >= %s AND bg.created_at < %s AND bg.release_amount > 0
                   THEN 1 END) AS redemption_count
    FROM bonus_subhead sh
    JOIN bonus_head h ON h.id = sh.head_id
    LEFT JOIN bonus_configure c ON c.subhead_id = sh.id
    LEFT JOIN bonus_grant bg ON bg.configure_id = c.id
    WHERE sh.site_id = %s
    GROUP BY sh.id, sh.name, sh.description, h.name
    ORDER BY sh.name
    LIMIT %s OFFSET %s
"""


async def get_budget_spend_report(
    site_id: int, since: datetime, until: datetime, window_days: int, limit: int, offset: int,
) -> BudgetSpendResponse:
    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SPEND_KPI_SQL, (site_id, since, until))
                redemption_count, total_cost = await cur.fetchone()

                await cur.execute(_SPEND_BUDGET_SQL, (site_id, site_id))
                monthly_used, monthly_limit = await cur.fetchone()

                await cur.execute(_SPEND_COUNT_SQL, (site_id,))
                total = (await cur.fetchone())[0]

                await cur.execute(_SPEND_ROWS_SQL, (since, until, since, until, site_id, limit, offset))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("bonus_reports.budget_spend.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    total_cost_d = Decimal(str(total_cost))
    monthly_used_d = Decimal(str(monthly_used))
    monthly_limit_d = Decimal(str(monthly_limit))

    result_rows = []
    for subhead_id, name, description, programme, bonuses, budget_limit, used, bonus_cost, redemption_ct in rows:
        used_d = Decimal(str(used))
        budget_limit_d = Decimal(str(budget_limit)) if budget_limit is not None else None
        bonus_cost_d = Decimal(str(bonus_cost))
        avg_cost = _money(bonus_cost_d / redemption_ct) if redemption_ct else Decimal("0.00")
        result_rows.append(BudgetSpendRow(
            subhead_id=subhead_id,
            name=name,
            description=description,
            programme=programme,
            bonuses=int(bonuses),
            budget_limit=budget_limit_d,
            used=used_d,
            utilisation_pct=_pct(float(used_d / budget_limit_d * 100)) if budget_limit_d and budget_limit_d > 0 else None,
            bonus_cost=bonus_cost_d,
            ggr=_UNTRACKED,
            avg_cost_per_redeem=avg_cost,
        ))

    return BudgetSpendResponse(
        window_days=window_days,
        total_bonus_cost=total_cost_d,
        avg_cost_per_redemption=_money(total_cost_d / redemption_count) if redemption_count else Decimal("0.00"),
        budget_utilisation_pct=_pct(float(monthly_used_d / monthly_limit_d * 100)) if monthly_limit_d > 0 else 0.0,
        total=total,
        limit=limit,
        offset=offset,
        rows=result_rows,
    )


# ---------------------------------------------------------------------------
# Player Activity
# ---------------------------------------------------------------------------

_ACTIVITY_KPI_SQL = """
    SELECT
        COUNT(DISTINCT pam_user_id) AS total_players,
        COALESCE(SUM(grant_amount), 0) AS total_value,
        COALESCE(SUM(release_amount), 0) AS total_released
    FROM bonus_grant
    WHERE site_id = %s AND created_at >= %s AND created_at < %s
"""


_ACTIVITY_COUNT_SQL = """
    SELECT COUNT(DISTINCT pam_user_id)
    FROM bonus_grant
    WHERE site_id = %s AND created_at >= %s AND created_at < %s
"""

_ACTIVITY_ROWS_SQL = """
    SELECT
        pam_user_id,
        COUNT(*) AS bonuses_received,
        COUNT(CASE WHEN consume_amount > 0 THEN 1 END) AS redeemed_count,
        COALESCE(SUM(grant_amount), 0) AS total_value,
        COALESCE(SUM(release_amount), 0) AS total_released
    FROM bonus_grant
    WHERE site_id = %s AND created_at >= %s AND created_at < %s
    GROUP BY pam_user_id
    ORDER BY total_value DESC
"""


async def get_player_activity_report(
    site_id: int, since: datetime, until: datetime, search: str | None, limit: int, offset: int,
) -> PlayerActivityResponse:
    # pam_user_mapping lives in a separate database (POOL_COMMON, "wynta_common"),
    # not POOL_BONUS ("wynta_bonus") — cannot be joined in a single connection.
    search_pam_ids: set[str] | None = None
    if search:
        try:
            async with get_connection(POOL_COMMON) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT id FROM pam_user_mapping WHERE site_id = %s AND user_id LIKE %s",
                        (site_id, f"%{search}%"),
                    )
                    search_pam_ids = {str(r[0]) for r in await cur.fetchall()}
        except Exception as exc:
            log.error("bonus_reports.player_activity.search_lookup_failed", error=str(exc))
            raise DatabaseError(str(exc)) from exc
        if not search_pam_ids:
            return PlayerActivityResponse(
                total_players=0, total_bonus_value=Decimal("0"), avg_wagering_pct=0.0,
                total=0, limit=limit, offset=offset, rows=[],
            )

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_ACTIVITY_KPI_SQL, (site_id, since, until))
                total_players, total_value, total_released = await cur.fetchone()

                await cur.execute(_ACTIVITY_ROWS_SQL, (site_id, since, until))
                all_rows = await cur.fetchall()
    except Exception as exc:
        log.error("bonus_reports.player_activity.db_error", error=str(exc))
        raise DatabaseError(str(exc)) from exc

    if search_pam_ids is not None:
        all_rows = [r for r in all_rows if str(r[0]) in search_pam_ids]
    total = len(all_rows)
    rows = all_rows[offset:offset + limit]

    external_ids: dict[str, str] = {}
    pam_ids = [str(r[0]) for r in rows]
    if pam_ids:
        try:
            placeholders = ",".join(["%s"] * len(pam_ids))
            async with get_connection(POOL_COMMON) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        f"SELECT id, user_id FROM pam_user_mapping WHERE id IN ({placeholders})",
                        tuple(pam_ids),
                    )
                    external_ids = {str(pid): uid for pid, uid in await cur.fetchall()}
        except Exception as exc:
            log.warning("bonus_reports.player_activity.external_id_lookup_failed", error=str(exc))

    total_value_d = Decimal(str(total_value))
    total_released_d = Decimal(str(total_released))

    result_rows = []
    for pam_user_id, bonuses_received, redeemed_count, row_value, row_released in rows:
        row_value_d = Decimal(str(row_value))
        row_released_d = Decimal(str(row_released))
        result_rows.append(PlayerActivityRow(
            pam_user_id=str(pam_user_id),
            external_user_id=external_ids.get(str(pam_user_id), str(pam_user_id)),
            bonuses_received=int(bonuses_received),
            redeemed_count=int(redeemed_count),
            total_value=row_value_d,
            wagering_completion_pct=_pct(float(row_released_d / row_value_d * 100)) if row_value_d > 0 else 0.0,
        ))

    return PlayerActivityResponse(
        total_players=int(total_players),
        total_bonus_value=total_value_d,
        avg_wagering_pct=_pct(float(total_released_d / total_value_d * 100)) if total_value_d > 0 else 0.0,
        total=total,
        limit=limit,
        offset=offset,
        rows=result_rows,
    )


# ---------------------------------------------------------------------------
# Custom Report
# ---------------------------------------------------------------------------
#
# One row per dimension value (bonus / subhead / programme(head) / player),
# one column per requested metric. Every metric except `ggr` and
# `redemption_rate_pct` is genuinely computable for every dimension (budget
# fields are simply None — not "untracked" — for the `player` dimension,
# since players have no budget entity).

_STATUS_CLAUSES = {
    "active":  "AND c.active = 1 AND c.end_date >= NOW()",
    "expired": "AND c.end_date < NOW()",
    "paused":  "AND c.active = 0 AND c.end_date >= NOW()",
}


def _status_clause(status: str | None) -> str:
    return _STATUS_CLAUSES.get(status or "", "")


def _custom_report_metric_values(
    metrics: list[str],
    redemptions: int, unique_players: int, avg_payout: Decimal,
    total_cost: Decimal, total_granted: Decimal,
    budget_used: Decimal | None, budget_limit: Decimal | None,
) -> dict[str, TrackedValue]:
    values: dict[str, TrackedValue] = {}
    for key in metrics:
        if key == "redemptions":
            values[key] = TrackedValue(value=redemptions)
        elif key == "unique_players":
            values[key] = TrackedValue(value=unique_players)
        elif key == "avg_payout":
            values[key] = TrackedValue(value=_money(avg_payout))
        elif key == "total_bonus_cost":
            values[key] = TrackedValue(value=_money(total_cost))
        elif key == "avg_cost_per_redemption":
            values[key] = TrackedValue(value=_money(total_cost / redemptions) if redemptions else Decimal("0.00"))
        elif key == "budget_used":
            values[key] = TrackedValue(value=_money(budget_used) if budget_used is not None else None)
        elif key == "budget_utilisation_pct":
            pct = _pct(float(budget_used / budget_limit * 100)) if budget_used is not None and budget_limit and budget_limit > 0 else None
            values[key] = TrackedValue(value=pct)
        elif key == "wagering_completion_pct":
            pct = _pct(float(total_cost / total_granted * 100)) if total_granted > 0 else 0.0
            values[key] = TrackedValue(value=pct)
        elif key in ("ggr", "redemption_rate_pct"):
            values[key] = _UNTRACKED
        else:
            values[key] = TrackedValue(value=None, tracked=False)
    return values


_CUSTOM_BONUS_COUNT_SQL = "SELECT COUNT(*) FROM bonus_configure c WHERE c.site_id = %s {status}"
_CUSTOM_BONUS_ROWS_SQL = """
    SELECT
        c.id, c.name,
        COUNT(bg.id) AS redemptions,
        COUNT(DISTINCT bg.pam_user_id) AS unique_players,
        COALESCE(AVG(bg.release_amount), 0) AS avg_payout,
        COALESCE(SUM(bg.release_amount), 0) AS total_cost,
        COALESCE(SUM(bg.grant_amount), 0) AS total_granted,
        (SELECT bu.budget_used FROM bonus_budget_usage bu
         WHERE bu.entity_type = 'CONFIGURE' AND bu.entity_id = c.id AND bu.period_type = 'MONTHLY') AS budget_used,
        (SELECT bl.budget_limit FROM bonus_budget_limit bl
         WHERE bl.entity_type = 'CONFIGURE' AND bl.entity_id = c.id AND bl.period_type = 'MONTHLY') AS budget_limit
    FROM bonus_configure c
    LEFT JOIN bonus_grant bg ON bg.configure_id = c.id AND bg.created_at >= %s AND bg.created_at < %s
    WHERE c.site_id = %s {status}
    GROUP BY c.id, c.name
    ORDER BY redemptions DESC
    LIMIT %s OFFSET %s
"""

_CUSTOM_SUBHEAD_COUNT_SQL = "SELECT COUNT(*) FROM bonus_subhead WHERE site_id = %s"
_CUSTOM_SUBHEAD_ROWS_SQL = """
    SELECT
        sh.id, sh.name,
        COUNT(bg.id) AS redemptions,
        COUNT(DISTINCT bg.pam_user_id) AS unique_players,
        COALESCE(AVG(bg.release_amount), 0) AS avg_payout,
        COALESCE(SUM(bg.release_amount), 0) AS total_cost,
        COALESCE(SUM(bg.grant_amount), 0) AS total_granted,
        (SELECT bu.budget_used FROM bonus_budget_usage bu
         WHERE bu.entity_type = 'SUBHEAD' AND bu.entity_id = sh.id AND bu.period_type = 'MONTHLY') AS budget_used,
        (SELECT bl.budget_limit FROM bonus_budget_limit bl
         WHERE bl.entity_type = 'SUBHEAD' AND bl.entity_id = sh.id AND bl.period_type = 'MONTHLY') AS budget_limit
    FROM bonus_subhead sh
    LEFT JOIN bonus_configure c ON c.subhead_id = sh.id
    LEFT JOIN bonus_grant bg ON bg.configure_id = c.id AND bg.created_at >= %s AND bg.created_at < %s
    WHERE sh.site_id = %s
    GROUP BY sh.id, sh.name
    ORDER BY redemptions DESC
    LIMIT %s OFFSET %s
"""

_CUSTOM_PROGRAMME_COUNT_SQL = "SELECT COUNT(*) FROM bonus_head WHERE site_id = %s"
_CUSTOM_PROGRAMME_ROWS_SQL = """
    SELECT
        h.id, h.name,
        COUNT(bg.id) AS redemptions,
        COUNT(DISTINCT bg.pam_user_id) AS unique_players,
        COALESCE(AVG(bg.release_amount), 0) AS avg_payout,
        COALESCE(SUM(bg.release_amount), 0) AS total_cost,
        COALESCE(SUM(bg.grant_amount), 0) AS total_granted,
        (SELECT bu.budget_used FROM bonus_budget_usage bu
         WHERE bu.entity_type = 'HEAD' AND bu.entity_id = h.id AND bu.period_type = 'MONTHLY') AS budget_used,
        (SELECT bl.budget_limit FROM bonus_budget_limit bl
         WHERE bl.entity_type = 'HEAD' AND bl.entity_id = h.id AND bl.period_type = 'MONTHLY') AS budget_limit
    FROM bonus_head h
    LEFT JOIN bonus_subhead sh ON sh.head_id = h.id
    LEFT JOIN bonus_configure c ON c.subhead_id = sh.id
    LEFT JOIN bonus_grant bg ON bg.configure_id = c.id AND bg.created_at >= %s AND bg.created_at < %s
    WHERE h.site_id = %s
    GROUP BY h.id, h.name
    ORDER BY redemptions DESC
    LIMIT %s OFFSET %s
"""

_CUSTOM_PLAYER_COUNT_SQL = """
    SELECT COUNT(DISTINCT pam_user_id) FROM bonus_grant
    WHERE site_id = %s AND created_at >= %s AND created_at < %s
"""
_CUSTOM_PLAYER_ROWS_SQL = """
    SELECT
        pam_user_id, pam_user_id AS label,
        COUNT(*) AS redemptions,
        1 AS unique_players,
        COALESCE(AVG(release_amount), 0) AS avg_payout,
        COALESCE(SUM(release_amount), 0) AS total_cost,
        COALESCE(SUM(grant_amount), 0) AS total_granted,
        NULL AS budget_used, NULL AS budget_limit
    FROM bonus_grant
    WHERE site_id = %s AND created_at >= %s AND created_at < %s
    GROUP BY pam_user_id
    ORDER BY total_cost DESC
    LIMIT %s OFFSET %s
"""


async def get_custom_report(
    site_id: int, dimension: str, metrics: list[str], status: str | None,
    since: datetime, until: datetime, limit: int, offset: int,
) -> CustomReportResponse:
    if dimension not in ("bonus", "subhead", "programme", "player"):
        raise ValueError(f"Unknown dimension: {dimension!r}")

    status_sql = _status_clause(status) if dimension == "bonus" else ""

    try:
        async with get_connection(POOL_BONUS) as conn:
            async with conn.cursor() as cur:
                if dimension == "bonus":
                    await cur.execute(_CUSTOM_BONUS_COUNT_SQL.format(status=status_sql), (site_id,))
                    total = (await cur.fetchone())[0]
                    await cur.execute(
                        _CUSTOM_BONUS_ROWS_SQL.format(status=status_sql),
                        (since, until, site_id, limit, offset),
                    )
                    rows = await cur.fetchall()
                elif dimension == "subhead":
                    await cur.execute(_CUSTOM_SUBHEAD_COUNT_SQL, (site_id,))
                    total = (await cur.fetchone())[0]
                    await cur.execute(_CUSTOM_SUBHEAD_ROWS_SQL, (since, until, site_id, limit, offset))
                    rows = await cur.fetchall()
                elif dimension == "programme":
                    await cur.execute(_CUSTOM_PROGRAMME_COUNT_SQL, (site_id,))
                    total = (await cur.fetchone())[0]
                    await cur.execute(_CUSTOM_PROGRAMME_ROWS_SQL, (since, until, site_id, limit, offset))
                    rows = await cur.fetchall()
                else:  # player
                    await cur.execute(_CUSTOM_PLAYER_COUNT_SQL, (site_id, since, until))
                    total = (await cur.fetchone())[0]
                    await cur.execute(_CUSTOM_PLAYER_ROWS_SQL, (site_id, since, until, limit, offset))
                    rows = await cur.fetchall()
    except Exception as exc:
        log.error("bonus_reports.custom.db_error", dimension=dimension, error=str(exc))
        raise DatabaseError(str(exc)) from exc

    external_ids: dict[str, str] = {}
    if dimension == "player" and rows:
        pam_ids = [str(r[0]) for r in rows]
        try:
            placeholders = ",".join(["%s"] * len(pam_ids))
            async with get_connection(POOL_COMMON) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        f"SELECT id, user_id FROM pam_user_mapping WHERE id IN ({placeholders})",
                        tuple(pam_ids),
                    )
                    external_ids = {str(pid): uid for pid, uid in await cur.fetchall()}
        except Exception as exc:
            log.warning("bonus_reports.custom.external_id_lookup_failed", error=str(exc))

    result_rows = []
    for row in rows:
        entity_id, label, redemptions, unique_players, avg_payout, total_cost, total_granted, *rest = row
        budget_used = Decimal(str(rest[0])) if rest and rest[0] is not None else None
        budget_limit = Decimal(str(rest[1])) if len(rest) > 1 and rest[1] is not None else None

        dimension_label = external_ids.get(str(entity_id), str(entity_id)) if dimension == "player" else label

        result_rows.append(CustomReportRow(
            dimension_label=dimension_label,
            values=_custom_report_metric_values(
                metrics,
                int(redemptions), int(unique_players), Decimal(str(avg_payout)),
                Decimal(str(total_cost)), Decimal(str(total_granted)),
                budget_used, budget_limit,
            ),
        ))

    return CustomReportResponse(
        dimension=dimension, columns=metrics, total=total, limit=limit, offset=offset, rows=result_rows,
    )
