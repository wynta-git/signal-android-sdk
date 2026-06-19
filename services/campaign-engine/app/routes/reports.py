import asyncio
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import ChDep, PortalAuthDep, get_db
from app.models import CreateReportRequest, CustomReport, ReportFilters, UpdateReportRequest
from shared.clients.mongo import get_dashboard_delivery_stats

log = structlog.get_logger()


def _ch_table(project_id: str, database: str = "pam") -> str:
    """Per-client ClickHouse table name — mirrors event-processor SchemaManager.table_name()."""
    safe = re.sub(r"[^a-z0-9_]", "_", project_id.lower()).strip("_") or "unknown"
    return f"{database}.events_{safe}"


router = APIRouter(
    prefix="/projects/{project_id}/reports",
    tags=["reports"],
)

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]

_COLLECTION = "custom_reports"

_DATE_RANGE_DAYS: dict[str, int] = {
    "last_7_days": 7,
    "last_30_days": 30,
    "last_90_days": 90,
}


def _make_report_id() -> str:
    return "rep_" + uuid.uuid4().hex[:12]


def _require_user_id(ctx: Any) -> None:
    if not ctx.user_id:
        raise HTTPException(
            status_code=403,
            detail={"code": "token_missing_user_id", "message": "Token does not contain a user_id — please refresh your token"},
        )


def _resolve_window(date_range: str) -> tuple[datetime, datetime, int]:
    days = _DATE_RANGE_DAYS.get(date_range, 7)
    now = datetime.now(timezone.utc)
    return now - timedelta(days=days), now, days


def _safe_rate(numerator: int, denominator: int) -> float | None:
    if not denominator:
        return None
    return round(numerator / denominator, 4)


def _change_pct(current: float | int, previous: float | int) -> float | None:
    if not previous:
        return None
    result = round((current - previous) / previous * 100, 1)
    return result if abs(result) <= 9999 else None


def _crunch_deliveries(raw: list[dict]) -> dict:
    out: dict = {}
    for row in raw:
        ch = row["_id"]["channel"]
        st = row["_id"]["status"]
        dt = row["_id"]["date"]
        out.setdefault(ch, {}).setdefault(st, {}).setdefault(dt, 0)
        out[ch][st][dt] += row["count"]
    return out


def _sum_status(buckets: dict, status: str) -> int:
    return sum(
        sum(dates.values())
        for ch_data in buckets.values()
        for st, dates in ch_data.items()
        if st == status
    )



def _doc_to_report(doc: dict) -> CustomReport:
    return CustomReport(
        report_id=doc["report_id"],
        user_id=doc["user_id"],
        project_id=doc["project_id"],
        name=doc["name"],
        metrics=doc["metrics"],
        filters=ReportFilters(**doc["filters"]),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


# ---------------------------------------------------------------------------
# Metric computation
# ---------------------------------------------------------------------------

async def _compute_metrics(
    db: AsyncIOMotorDatabase,
    project_id: str,
    metrics: list[str],
    filters: ReportFilters,
) -> dict[str, Any]:
    since, now, window_days = _resolve_window(filters.date_range)
    prev_since = since - timedelta(days=window_days)

    # Fetch what we need based on requested metrics
    needs_deliveries = any(m in metrics for m in (
        "messages_sent", "delivery_rate", "bounce_rate", "opt_out_rate"
    ))
    needs_analytics = any(m in metrics for m in ("open_rate", "ctr"))
    needs_users = any(m in metrics for m in (
        "active_users", "player_health_score", "churn_rate"
    ))
    needs_segments = "segment_size" in metrics

    tasks: dict[str, Any] = {}

    if needs_deliveries:
        tasks["curr_raw"] = get_dashboard_delivery_stats(db, project_id, since, now)
        tasks["prev_raw"] = get_dashboard_delivery_stats(db, project_id, prev_since, since)

    if needs_users:
        tasks["total_users"] = db["users"].count_documents({"project_id": project_id})
        tasks["active_users"] = db["users"].count_documents(
            {"project_id": project_id, "last_seen_at": {"$gte": since}}
        )
        tasks["health"] = db["users"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {
                "_id": "$health_status",
                "count": {"$sum": 1},
            }},
        ]).to_list(length=None)

    if needs_segments:
        tasks["seg_agg"] = db["segments"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": None, "total": {"$sum": "$members_count"}}},
        ]).to_list(length=1)

    results = dict(zip(tasks.keys(), await asyncio.gather(*tasks.values())))

    data: dict[str, Any] = {}

    # Delivery-based metrics
    if needs_deliveries:
        curr = _crunch_deliveries(results.get("curr_raw", []))
        prev = _crunch_deliveries(results.get("prev_raw", []))

        curr_sent   = _sum_status(curr, "sent")
        prev_sent   = _sum_status(prev, "sent")
        curr_failed = _sum_status(curr, "failed")

        if "messages_sent" in metrics:
            data["messages_sent"] = {
                "value":      curr_sent,
                "change_pct": _change_pct(curr_sent, prev_sent),
            }

        if "delivery_rate" in metrics:
            data["delivery_rate"] = {"value": _safe_rate(curr_sent, curr_sent + curr_failed)}

        if "bounce_rate" in metrics:
            data["bounce_rate"] = {"value": _safe_rate(curr_failed, curr_sent + curr_failed)}

        if "opt_out_rate" in metrics:
            data["opt_out_rate"] = {"value": None, "tracked": False}

    # Analytics-based metrics — require SDK events; not yet tracked
    if needs_analytics:
        if "open_rate" in metrics:
            data["open_rate"] = {"value": None, "tracked": False}
        if "ctr" in metrics:
            data["ctr"] = {"value": None, "tracked": False}

    # User-based metrics
    if needs_users:
        total = results.get("total_users", 0) or 1
        active = results.get("active_users", 0)
        health_rows = results.get("health") or []
        health_map = {r["_id"]: r["count"] for r in health_rows if r["_id"]}
        churned = health_map.get("churned", 0)

        if "active_users" in metrics:
            data["active_users"] = {"value": active}

        if "churn_rate" in metrics:
            data["churn_rate"] = {"value": _safe_rate(churned, total)}

        if "player_health_score" in metrics:
            healthy = health_map.get("healthy", 0)
            data["player_health_score"] = {"value": _safe_rate(healthy, total)}

    # Segment-based metrics
    if needs_segments:
        seg_agg = results.get("seg_agg") or []
        total_members = seg_agg[0]["total"] if seg_agg else 0
        data["segment_size"] = {"value": total_members}

    # Untracked metrics — return null so UI shows "—"
    untracked = {
        "conversions", "conversion_rate", "revenue_influenced",
        "segment_growth", "win_back_rate", "avg_deposits",
    }
    for m in metrics:
        if m in untracked:
            data[m] = {"value": None, "tracked": False}

    return data


# ---------------------------------------------------------------------------
# Campaign stats helpers (reused from dashboard patterns)
# ---------------------------------------------------------------------------

_CHANNEL_TIERS = ("email", "push", "sms")   # primary / secondary / tertiary
_TIER_LABELS   = ("primary", "secondary", "tertiary")


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/reports/campaign-stats
# ---------------------------------------------------------------------------

@router.get("/campaign-stats")
async def get_campaign_stats(
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
    ch: ChDep,
    window_days: int = Query(default=7, ge=1, le=90),
    channel: str = Query(default="all"),
    segment_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    now   = datetime.now(timezone.utc)
    since = now - timedelta(days=window_days)
    prev_since = since - timedelta(days=window_days)

    # ── Parallel fetches ────────────────────────────────────────────────────
    campaign_query: dict[str, Any] = {"project_id": project_id, "status": {"$in": ["running", "scheduled", "paused", "completed"]}}
    if segment_id:
        campaign_query["audience.segment_id"] = segment_id
    if channel != "all":
        campaign_query["channel"] = channel

    (
        curr_raw, prev_raw,
        campaign_docs, run_rows,
        ch_events_by_campaign,
        conversions_by_campaign,
    ) = await asyncio.gather(
        get_dashboard_delivery_stats(db, project_id, since, now),
        get_dashboard_delivery_stats(db, project_id, prev_since, since),
        db["campaigns"].find(campaign_query, {"_id": 0, "campaign_id": 1, "name": 1, "channel": 1, "status": 1, "audience": 1})
            .sort("updated_at", -1).skip(offset).limit(limit).to_list(length=None),
        db["campaign_runs"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": "$campaign_id", "total_sent": {"$sum": "$sent_count"}}},
        ]).to_list(length=None),
        _query_notification_events_by_campaign(ch, project_id, since, until=now),
        _query_conversions_by_campaign(ch, project_id, since, until=now),
    )

    # ── Summary ─────────────────────────────────────────────────────────────
    curr = _crunch_deliveries(curr_raw)
    prev = _crunch_deliveries(prev_raw)

    curr_sent = _sum_status(curr, "sent")
    prev_sent = _sum_status(prev, "sent")

    total_opens  = sum(v["opens"]  for v in ch_events_by_campaign.values())
    total_clicks = sum(v["clicks"] for v in ch_events_by_campaign.values())
    tracked = bool(ch_events_by_campaign)

    conv_tracked = bool(conversions_by_campaign)
    total_conversions = sum(v["conversions"] for v in conversions_by_campaign.values())
    total_revenue     = sum(v["revenue"]     for v in conversions_by_campaign.values())

    summary = {
        "total_sent": {
            "value":      curr_sent,
            "change_pct": _change_pct(curr_sent, prev_sent),
        },
        "avg_open_rate": {
            "value":   _safe_rate(total_opens, curr_sent),
            "tracked": tracked,
        },
        "avg_ctr": {
            "value":   _safe_rate(total_clicks, curr_sent),
            "tracked": tracked,
        },
        "conversions": {
            "value":   total_conversions if conv_tracked else None,
            "tracked": conv_tracked,
        },
        "revenue_influenced": {
            "value":   round(total_revenue, 2) if conv_tracked else None,
            "tracked": conv_tracked,
        },
    }

    # ── Trend (primary/secondary/tertiary by channel tier) ──────────────────
    window_dates = [str((since + timedelta(days=i)).date()) for i in range(window_days)]

    trend: list[dict] = []
    for date_str in window_dates:
        real_by_ch: dict[str, int] = {}
        for ch_key, statuses in curr.items():
            for st, dates in statuses.items():
                if st == "sent" and date_str in dates:
                    real_by_ch[ch_key] = real_by_ch.get(ch_key, 0) + dates[date_str]

        point: dict[str, Any] = {"date": date_str}
        for tier, ch_key in zip(_TIER_LABELS, _CHANNEL_TIERS):
            point[tier] = real_by_ch.get(ch_key, 0)
        trend.append(point)

    # ── Campaign table ────────────────────────────────────────────────────────
    sent_by_campaign = {r["_id"]: r["total_sent"] for r in run_rows}
    campaigns_out = []
    for d in campaign_docs:
        cid = d["campaign_id"]
        sent = sent_by_campaign.get(cid, 0)
        ev   = ch_events_by_campaign.get(cid, {})
        conv = conversions_by_campaign.get(cid)
        campaigns_out.append({
            "campaign_id": cid,
            "name":        d["name"],
            "channel":     d["channel"],
            "sent":        sent,
            "open_rate":   _safe_rate(ev.get("opens", 0), sent),
            "ctr":         _safe_rate(ev.get("clicks", 0), sent),
            "conversions":        conv["conversions"]             if conv else None,
            "revenue_influenced": round(conv["revenue"], 2) if conv else None,
            "status":      d["status"],
        })
    campaigns_out.sort(key=lambda c: c["sent"], reverse=True)

    return {
        "window_days": window_days,
        "summary":   summary,
        "trend":     trend,
        "campaigns": campaigns_out,
    }


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/reports/channel-delivery
# ---------------------------------------------------------------------------

_ALL_CHANNELS = ("email", "push", "sms", "whatsapp", "telegram", "in_app")


async def _query_conversions_by_campaign(
    ch: Any,
    project_id: str,
    since: datetime,
    until: datetime,
    attribution_hours: int = 24,
) -> dict[str, dict[str, Any]]:
    """Last-touch attribution: deposit_success within `attribution_hours` of a notification open/click.

    Returns {campaign_id: {conversions: N, revenue: float}}.
    Only campaigns that had at least one attributed deposit appear in the result.
    Returns {} on any ClickHouse error so callers degrade gracefully.
    """
    tbl = _ch_table(project_id)
    query = f"""
        SELECT
            n.campaign_id,
            uniq(d.user_id)  AS conversions,
            sum(d.amount)    AS revenue
        FROM (
            SELECT user_id, campaign_id, max(timestamp) AS last_touch
            FROM {tbl}
            WHERE event_name IN ('notification_opened', 'notification_clicked')
              AND campaign_id IS NOT NULL
              AND campaign_id != ''
              AND timestamp >= {{since:DateTime}}
              AND timestamp <  {{until:DateTime}}
            GROUP BY user_id, campaign_id
        ) AS n
        INNER JOIN (
            SELECT user_id, amount, timestamp
            FROM {tbl}
            WHERE event_name = 'deposit_success'
              AND amount > 0
              AND timestamp >= {{since:DateTime}}
              AND timestamp <  addHours({{until:DateTime}}, {attribution_hours})
        ) AS d ON n.user_id = d.user_id
        WHERE d.timestamp >= n.last_touch
          AND d.timestamp <= addHours(n.last_touch, {attribution_hours})
        GROUP BY n.campaign_id
    """
    try:
        result = await ch.query(query, parameters={"since": since, "until": until})
        return {
            row["campaign_id"]: {
                "conversions": int(row["conversions"]),
                "revenue":     float(row["revenue"] or 0),
            }
            for row in result.named_results()
            if row.get("campaign_id")
        }
    except Exception:
        log.warning("clickhouse.conversions_by_campaign.failed", project_id=project_id)
        return {}


async def _query_notification_events_by_campaign(
    ch: Any,
    project_id: str,
    since: datetime,
    until: datetime,
) -> dict[str, dict[str, int]]:
    """Query ClickHouse for notification_opened/clicked counts per campaign_id.

    Returns {campaign_id: {opens: N, clicks: N}}. Returns {} on error.
    """
    tbl = _ch_table(project_id)
    query = f"""
        SELECT
            campaign_id,
            countIf(event_name = 'notification_opened')  AS opens,
            countIf(event_name = 'notification_clicked') AS clicks
        FROM {tbl}
        WHERE event_name IN ('notification_opened', 'notification_clicked')
          AND timestamp >= {{since:DateTime}}
          AND timestamp <  {{until:DateTime}}
          AND campaign_id IS NOT NULL
        GROUP BY campaign_id
    """
    try:
        result = await ch.query(query, parameters={"since": since, "until": until})
        return {
            row["campaign_id"]: {"opens": int(row["opens"]), "clicks": int(row["clicks"])}
            for row in result.named_results()
            if row.get("campaign_id")
        }
    except Exception:
        log.warning("clickhouse.notification_events_by_campaign.failed", project_id=project_id)
        return {}


async def _query_notification_events(
    ch: Any,
    project_id: str,
    since: datetime,
    until: datetime,
) -> dict[str, dict[str, int]]:
    """Query ClickHouse for notification_opened/clicked counts per channel.

    Returns {channel: {opens: N, clicks: N}}. Returns {} on any error so
    callers degrade gracefully when ClickHouse has no data yet.
    """
    tbl = _ch_table(project_id)
    query = f"""
        SELECT
            channel,
            countIf(event_name = 'notification_opened')  AS opens,
            countIf(event_name = 'notification_clicked') AS clicks
        FROM {tbl}
        WHERE event_name IN ('notification_opened', 'notification_clicked')
          AND timestamp >= {{since:DateTime}}
          AND timestamp <  {{until:DateTime}}
        GROUP BY channel
    """
    try:
        result = await ch.query(
            query,
            parameters={"since": since, "until": until},
        )
        out: dict[str, dict[str, int]] = {}
        for row in result.named_results():
            ch_key = row["channel"]
            if ch_key:
                out[ch_key] = {"opens": int(row["opens"]), "clicks": int(row["clicks"])}
        return out
    except Exception:
        log.warning("clickhouse.notification_events.failed", project_id=project_id)
        return {}


async def _query_deposit_totals(
    ch: Any,
    project_id: str,
    since: datetime,
    until: datetime,
) -> list[dict]:
    """Return [{user_id, total}] for deposit_success events in the window.

    Returns [] on any error so callers degrade gracefully.
    """
    tbl = _ch_table(project_id)
    query = f"""
        SELECT user_id, sum(amount) AS total
        FROM {tbl}
        WHERE event_name = 'deposit_success'
          AND timestamp >= {{since:DateTime}}
          AND timestamp <  {{until:DateTime}}
          AND amount IS NOT NULL
        GROUP BY user_id
    """
    try:
        result = await ch.query(
            query,
            parameters={"since": since, "until": until},
        )
        return [{"user_id": r["user_id"], "total": float(r["total"])} for r in result.named_results()]
    except Exception:
        log.warning("clickhouse.deposit_totals.failed", project_id=project_id)
        return []


@router.get("/channel-delivery")
async def get_channel_delivery(
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
    ch: ChDep,
    window_days: int = Query(default=7, ge=1, le=90),
    channel: str = Query(default="all"),
    segment_id: str | None = Query(default=None),
) -> dict:
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    now        = datetime.now(timezone.utc)
    since      = now - timedelta(days=window_days)
    prev_since = since - timedelta(days=window_days)

    (curr_raw, prev_raw), ch_events = await asyncio.gather(
        asyncio.gather(
            get_dashboard_delivery_stats(db, project_id, since, now),
            get_dashboard_delivery_stats(db, project_id, prev_since, since),
        ),
        _query_notification_events(ch, project_id, since, now),
    )

    curr = _crunch_deliveries(curr_raw)
    prev = _crunch_deliveries(prev_raw)

    if channel != "all":
        curr = {k: v for k, v in curr.items() if k == channel}
        prev = {k: v for k, v in prev.items() if k == channel}
        ch_events = {k: v for k, v in ch_events.items() if k == channel}

    # ── Summary ─────────────────────────────────────────────────────────────
    curr_sent   = _sum_status(curr, "sent")
    prev_sent   = _sum_status(prev, "sent")
    curr_failed = _sum_status(curr, "failed")

    active_channels = sum(
        1 for ch_data in curr.values()
        if "sent" in ch_data and sum(ch_data["sent"].values()) > 0
    )
    known_set    = set(_ALL_CHANNELS)
    active_set   = {ch_key for ch_key, ch_data in curr.items() if "sent" in ch_data and sum(ch_data["sent"].values()) > 0}
    paused_count = len(known_set - active_set) if channel == "all" else 0

    summary = {
        "total_messages": {
            "value":      curr_sent,
            "change_pct": _change_pct(curr_sent, prev_sent),
        },
        "delivery_rate": {
            "value": _safe_rate(curr_sent, curr_sent + curr_failed),
        },
        "bounce_rate": {
            "value": _safe_rate(curr_failed, curr_sent + curr_failed),
        },
        "opt_outs_7d": {"value": None, "tracked": False},
        "active_channels": {
            "value":  active_channels,
            "paused": paused_count,
        },
    }

    # ── Trend (primary=email / secondary=push / tertiary=sms) ───────────────
    window_dates = [str((since + timedelta(days=i)).date()) for i in range(window_days)]
    trend: list[dict] = []
    for date_str in window_dates:
        real_by_ch: dict[str, int] = {}
        for ch_key, statuses in curr.items():
            for st, dates in statuses.items():
                if st == "sent" and date_str in dates:
                    real_by_ch[ch_key] = real_by_ch.get(ch_key, 0) + dates[date_str]
        point: dict[str, Any] = {"date": date_str}
        for tier, ch_key in zip(_TIER_LABELS, _CHANNEL_TIERS):
            point[tier] = real_by_ch.get(ch_key, 0)
        trend.append(point)

    # ── Channel table ────────────────────────────────────────────────────────
    channels_out: list[dict] = []
    all_ch_keys = sorted(set(curr.keys()) | (set(_ALL_CHANNELS) if channel == "all" else {channel}))
    for ch_key in all_ch_keys:
        ch_data   = curr.get(ch_key, {})
        ch_sent   = sum(sum(dates.values()) for st, dates in ch_data.items() if st == "sent")
        ch_failed = sum(sum(dates.values()) for st, dates in ch_data.items() if st == "failed")
        ch_total  = ch_sent + ch_failed
        if ch_total == 0:
            continue
        ev        = ch_events.get(ch_key, {})
        opens     = ev.get("opens", 0)
        clicks    = ev.get("clicks", 0)
        channels_out.append({
            "channel":       ch_key,
            "messages":      ch_total,
            "delivery_rate": _safe_rate(ch_sent, ch_total),
            "bounce_rate":   _safe_rate(ch_failed, ch_total),
            "open_rate":     _safe_rate(opens, ch_sent) if opens else None,
            "ctr":           _safe_rate(clicks, ch_sent) if clicks else None,
            "opt_outs":      None,
        })
    channels_out.sort(key=lambda c: c["messages"], reverse=True)

    return {
        "window_days": window_days,
        "summary":     summary,
        "trend":       trend,
        "channels":    channels_out,
    }


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/reports/segment-analysis
# ---------------------------------------------------------------------------

@router.get("/segment-analysis")
async def get_segment_analysis(
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
    window_days: int = Query(default=7, ge=1, le=90),
    segment_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    now   = datetime.now(timezone.utc)
    since = now - timedelta(days=window_days)

    # Always fetch all segments for summary stats; apply segment filter only for the table
    all_seg_docs = await db["segments"].find(
        {"project_id": project_id},
        {"_id": 0, "segment_id": 1, "name": 1, "members_count": 1, "last_refresh_time": 1},
    ).sort("members_count", -1).to_list(length=None)

    table_docs = (
        [s for s in all_seg_docs if s["segment_id"] == segment_id]
        if segment_id
        else all_seg_docs[:limit]
    )

    # Summary across all segments
    non_null = [s["members_count"] for s in all_seg_docs if s.get("members_count") is not None]
    total_segments = len(all_seg_docs)
    reachable_users = sum(non_null)
    avg_size = round(reachable_users / len(non_null)) if non_null else 0

    summary = {
        "total_segments":   {"value": total_segments},
        "reachable_users":  {"value": reachable_users},
        "segment_growth":   {"value": None, "tracked": False},
        "avg_segment_size": {"value": avg_size},
        "opt_in_rate":      {"value": None, "tracked": False},
    }

    # Trend: top 3 segments by size, flat members_count per day (no historical data)
    top3 = all_seg_docs[:3]
    window_dates = [str((since + timedelta(days=i)).date()) for i in range(window_days)]
    _tier_labels = ("primary", "secondary", "tertiary")
    trend: list[dict] = []
    for date_str in window_dates:
        point: dict[str, Any] = {"date": date_str}
        for i, label in enumerate(_tier_labels):
            point[label] = top3[i].get("members_count") or 0 if i < len(top3) else 0
        trend.append(point)

    # Segment status: live if refreshed within 48 h, else paused
    def _seg_status(doc: dict) -> str:
        lr = doc.get("last_refresh_time")
        if not lr:
            return "paused"
        if lr.tzinfo is None:
            lr = lr.replace(tzinfo=timezone.utc)
        return "live" if (now - lr).total_seconds() < 172_800 else "paused"

    segments_out = [
        {
            "segment_id": s["segment_id"],
            "name":       s["name"],
            "users":      s.get("members_count") or 0,
            "growth_7d":  None,
            "open_rate":  None,
            "conversion": None,
            "status":     _seg_status(s),
        }
        for s in table_docs
    ]

    return {
        "window_days": window_days,
        "summary":     summary,
        "trend":       trend,
        "segments":    segments_out,
    }


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/reports/player-lifecycle
# ---------------------------------------------------------------------------

_LIFECYCLE_STAGE_DEFS: list[tuple[str, str, str]] = [
    ("healthy",     "Healthy",      "< 7 days"),
    ("at_risk",     "At-Risk",      "8–29 days"),
    ("churned",     "Churned",      "30+ days"),
    ("reactivated", "Re-activated", "< 14 days"),
    ("new",         "New (< 7d)",   "< 7 days"),
    ("vip",         "VIP Tier",     "< 3 days"),
]


@router.get("/player-lifecycle")
async def get_player_lifecycle(
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
    ch: ChDep,
    window_days: int = Query(default=7, ge=1, le=90),
    segment_id: str | None = Query(default=None),
) -> dict:
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    now           = datetime.now(timezone.utc)
    since         = now - timedelta(days=window_days)
    thirty_ago    = now - timedelta(days=30)

    health_agg, total_curr, prev_total, touchpoints_agg, users_by_status, deposit_rows = await asyncio.gather(
        db["users"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": "$health_status", "count": {"$sum": 1}}},
        ]).to_list(length=None),
        db["users"].count_documents({"project_id": project_id}),
        db["users"].count_documents({"project_id": project_id, "created_at": {"$lt": since}}),
        db["users"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": "$health_status", "user_ids": {"$push": "$user_id"}}},
        ]).to_list(length=None),
        _query_deposit_totals(ch, project_id, thirty_ago, now),
        db["notification_deliveries"].aggregate([
            {"$match": {"project_id": project_id, "attempted_at": {"$gte": since}}},
            {"$group": {"_id": "$user_id", "delivery_count": {"$sum": 1}}},
            {
                "$lookup": {
                    "from": "users",
                    "let": {"uid": "$_id"},
                    "pipeline": [
                        {"$match": {"$expr": {"$and": [
                            {"$eq": ["$project_id", project_id]},
                            {"$eq": ["$user_id", "$$uid"]},
                        ]}}},
                        {"$project": {"health_status": 1, "_id": 0}},
                    ],
                    "as": "user_doc",
                }
            },
            {"$unwind": {"path": "$user_doc", "preserveNullAndEmpty": False}},
            {
                "$group": {
                    "_id": "$user_doc.health_status",
                    "total_deliveries": {"$sum": "$delivery_count"},
                    "user_count": {"$sum": 1},
                }
            },
        ]).to_list(length=None),
    )

    touchpoints_map: dict[str, float] = {
        row["_id"]: round(row["total_deliveries"] / row["user_count"], 1)
        for row in touchpoints_agg
        if row.get("_id") and row.get("user_count")
    }

    # {health_status: set(user_ids)} for deposit join
    status_to_users: dict[str, set[str]] = {
        row["_id"]: set(row["user_ids"])
        for row in users_by_status
        if row.get("_id")
    }
    # {user_id: total_deposit_30d} from ClickHouse
    deposit_by_user: dict[str, float] = {r["user_id"]: r["total"] for r in deposit_rows}

    health_map = {r["_id"]: r["count"] for r in health_agg if r["_id"]}
    total = total_curr or 1

    healthy     = health_map.get("healthy",     0)
    at_risk     = health_map.get("at_risk",     0)
    churned     = health_map.get("churned",     0)
    reactivated = health_map.get("reactivated", 0)
    new_users   = health_map.get("new",         0)
    vip         = health_map.get("vip",         0)

    summary = {
        "total_players": {
            "value":      total_curr,
            "change_pct": _change_pct(total_curr, prev_total) if prev_total else None,
        },
        "healthy": {
            "value": healthy,
            "pct":   _safe_rate(healthy, total),
        },
        "at_risk": {
            "value": at_risk,
            "pct":   _safe_rate(at_risk, total),
        },
        "churned": {
            "value": churned,
            "pct":   _safe_rate(churned, total),
        },
        "win_back_rate": {
            "value": _safe_rate(reactivated, churned + reactivated),
        },
    }

    # Trend: flat current distribution per day (no historical health snapshots)
    # primary = healthy, secondary = at_risk, tertiary = churned
    window_dates = [str((since + timedelta(days=i)).date()) for i in range(window_days)]
    trend: list[dict] = [
        {"date": d, "primary": healthy, "secondary": at_risk, "tertiary": churned}
        for d in window_dates
    ]

    # Stage table rows
    counts: dict[str, int] = {
        "healthy":     healthy,
        "at_risk":     at_risk,
        "churned":     churned,
        "reactivated": reactivated,
        "new":         new_users,
        "vip":         vip,
    }
    stages: list[dict] = []
    for key, label, days_range in _LIFECYCLE_STAGE_DEFS:
        count = counts.get(key, 0)
        if count == 0 and key not in ("healthy", "at_risk", "churned"):
            continue
        stage_uids     = status_to_users.get(key, set())
        stage_deposits = [deposit_by_user[uid] for uid in stage_uids if uid in deposit_by_user]
        avg_dep        = round(sum(stage_deposits) / len(stage_deposits), 2) if stage_deposits else None
        stages.append({
            "stage":             label,
            "players":           count,
            "pct_of_total":      _safe_rate(count, total),
            "avg_deposits_30d":  avg_dep,
            "days_since_active": days_range,
            "crm_touchpoints":   touchpoints_map.get(key),
        })

    return {
        "window_days": window_days,
        "summary":     summary,
        "trend":       trend,
        "stages":      stages,
    }


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/reports/churn-retention
# ---------------------------------------------------------------------------

_MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


@router.get("/churn-retention")
async def get_churn_retention(
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
    ch: ChDep,
    window_days: int = Query(default=7, ge=1, le=90),
    channel: str = Query(default="all"),
    segment_id: str | None = Query(default=None),
) -> dict:
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    now   = datetime.now(timezone.utc)
    since = now - timedelta(days=window_days)

    health_agg, cohort_agg, total_curr, users_by_status, users_by_cohort, deposit_rows = await asyncio.gather(
        db["users"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": "$health_status", "count": {"$sum": 1}}},
        ]).to_list(length=None),
        db["users"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {
                "_id": {
                    "year":          {"$year": "$created_at"},
                    "month":         {"$month": "$created_at"},
                    "health_status": "$health_status",
                },
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id.year": -1, "_id.month": -1}},
        ]).to_list(length=None),
        db["users"].count_documents({"project_id": project_id}),
        db["users"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": "$health_status", "user_ids": {"$push": "$user_id"}}},
        ]).to_list(length=None),
        db["users"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {
                "_id": {"year": {"$year": "$created_at"}, "month": {"$month": "$created_at"}},
                "user_ids": {"$push": "$user_id"},
            }},
        ]).to_list(length=None),
        _query_deposit_totals(ch, project_id, since, now),
    )

    deposit_by_user: dict[str, float] = {r["user_id"]: r["total"] for r in deposit_rows}

    status_to_uids: dict[str, set[str]] = {
        row["_id"]: set(row["user_ids"])
        for row in users_by_status
        if row.get("_id")
    }
    cohort_to_uids: dict[tuple[int, int], set[str]] = {
        (row["_id"]["year"], row["_id"]["month"]): set(row["user_ids"])
        for row in users_by_cohort
        if row.get("_id", {}).get("year") and row.get("_id", {}).get("month")
    }

    health_map  = {r["_id"]: r["count"] for r in health_agg if r["_id"]}
    total       = total_curr or 1
    churned     = health_map.get("churned",     0)
    retained    = health_map.get("healthy",     0)
    reactivated = health_map.get("reactivated", 0)

    churn_rate     = _safe_rate(churned, total)
    win_back_denom = churned + reactivated
    win_back_rate  = _safe_rate(reactivated, win_back_denom) if win_back_denom else None

    reactivated_uids = status_to_uids.get("reactivated", set())
    revenue_saved    = round(sum(deposit_by_user[uid] for uid in reactivated_uids if uid in deposit_by_user), 2) or None

    summary = {
        "churn_rate":      {"value": churn_rate},
        "churned_players": {"value": churned},
        "retained":        {"value": retained},
        "win_back_rate":   {"value": win_back_rate},
        "revenue_saved":   {"value": revenue_saved},
    }

    # Trend: flat current distribution per day — no historical health snapshots available
    # primary=retained, secondary=reactivated(win-back), tertiary=churned
    window_dates = [str((since + timedelta(days=i)).date()) for i in range(window_days)]
    trend: list[dict] = [
        {"date": d, "primary": retained, "secondary": reactivated, "tertiary": churned}
        for d in window_dates
    ]

    # Cohort table: group users by created_at year-month, pivot health_status counts
    cohort_map: dict[tuple[int, int], dict[str, int]] = {}
    for row in cohort_agg:
        yr = row["_id"].get("year")
        mo = row["_id"].get("month")
        hs = row["_id"].get("health_status") or "unknown"
        if yr and mo:
            cohort_map.setdefault((yr, mo), {})[hs] = row["count"]

    cohorts_out: list[dict] = []
    for (yr, mo), statuses in sorted(cohort_map.items(), key=lambda x: x[0], reverse=True):
        cohort_uids    = cohort_to_uids.get((yr, mo), set())
        rev_impact     = round(sum(deposit_by_user[uid] for uid in cohort_uids if uid in deposit_by_user), 2) or None
        cohorts_out.append({
            "cohort":         f"{_MONTH_NAMES[mo - 1]} {yr}",
            "players":        sum(statuses.values()),
            "churned":        statuses.get("churned",     0),
            "retained":       statuses.get("healthy",     0),
            "win_back":       statuses.get("reactivated", 0),
            "revenue_impact": rev_impact,
        })

    return {
        "window_days": window_days,
        "summary":     summary,
        "trend":       trend,
        "cohorts":     cohorts_out,
    }


# ---------------------------------------------------------------------------
# POST /projects/{project_id}/reports
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def create_report(
    project_id: str,
    body: CreateReportRequest,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict:
    _require_user_id(ctx)
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    now = datetime.now(timezone.utc)
    doc = {
        "report_id": _make_report_id(),
        "user_id": ctx.user_id,
        "project_id": project_id,
        "name": body.name,
        "metrics": body.metrics,
        "filters": body.filters.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    await db[_COLLECTION].insert_one(doc)
    log.info("custom_report.created", report_id=doc["report_id"], user_id=ctx.user_id, project_id=project_id)
    return {"report_id": doc["report_id"]}


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/reports
# ---------------------------------------------------------------------------

@router.get("")
async def list_reports(
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict:
    _require_user_id(ctx)
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    docs = await db[_COLLECTION].find(
        {"user_id": ctx.user_id, "project_id": project_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(length=None)

    return {"reports": [_doc_to_report(d).model_dump() for d in docs]}


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/reports/{report_id}
# ---------------------------------------------------------------------------

@router.get("/{report_id}")
async def get_report(
    project_id: str,
    report_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict:
    _require_user_id(ctx)
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    doc = await db[_COLLECTION].find_one(
        {"report_id": report_id, "user_id": ctx.user_id, "project_id": project_id},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Report not found"})

    report = _doc_to_report(doc)
    data = await _compute_metrics(db, project_id, report.metrics, report.filters)

    return {**report.model_dump(), "data": data}


# ---------------------------------------------------------------------------
# PATCH /projects/{project_id}/reports/{report_id}
# ---------------------------------------------------------------------------

@router.patch("/{report_id}")
async def update_report(
    project_id: str,
    report_id: str,
    body: UpdateReportRequest,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict:
    _require_user_id(ctx)
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    update: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if body.name is not None:
        update["name"] = body.name
    if body.metrics is not None:
        update["metrics"] = body.metrics
    if body.filters is not None:
        update["filters"] = body.filters.model_dump()

    result = await db[_COLLECTION].find_one_and_update(
        {"report_id": report_id, "user_id": ctx.user_id, "project_id": project_id},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Report not found"})

    return _doc_to_report(result).model_dump()


# ---------------------------------------------------------------------------
# DELETE /projects/{project_id}/reports/{report_id}
# ---------------------------------------------------------------------------

@router.delete("/{report_id}", status_code=204)
async def delete_report(
    project_id: str,
    report_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
) -> None:
    _require_user_id(ctx)
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    result = await db[_COLLECTION].delete_one(
        {"report_id": report_id, "user_id": ctx.user_id, "project_id": project_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Report not found"})
