import asyncio
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import PortalAuthDep, get_db
from app.models import CreateReportRequest, CustomReport, ReportFilters, UpdateReportRequest
from shared.clients.mongo import get_daily_boosts_range, get_dashboard_delivery_stats

log = structlog.get_logger()

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


def _crunch_daily_messages_sent(daily: dict) -> int:
    return sum(day.get("messages_sent", 0) for day in daily.values())


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
        tasks["daily_range"] = get_daily_boosts_range(db, project_id, since, now)
        tasks["boosts_doc"] = db["dashboard_boosts"].find_one(
            {"project_id": project_id}, {"_id": 0, "boosts": 1, "analytics": 1}
        )

    if needs_analytics and not needs_deliveries:
        tasks["boosts_doc"] = db["dashboard_boosts"].find_one(
            {"project_id": project_id}, {"_id": 0, "analytics": 1}
        )

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
        daily = results.get("daily_range") or {}
        boosts_doc = results.get("boosts_doc") or {}
        boost_sent = int((boosts_doc.get("boosts") or {}).get("quick_stats.messages_sent", 0))
        daily_sent = _crunch_daily_messages_sent(daily)
        win_scale = window_days / 30

        curr_sent = _sum_status(curr, "sent") + daily_sent + round(boost_sent * win_scale)
        prev_sent = _sum_status(prev, "sent") + round(boost_sent * win_scale)
        curr_failed = _sum_status(curr, "failed")

        if "messages_sent" in metrics:
            data["messages_sent"] = {
                "value": curr_sent,
                "change_pct": _change_pct(curr_sent, prev_sent),
            }

        if "delivery_rate" in metrics:
            dr = _safe_rate(curr_sent, curr_sent + curr_failed)
            data["delivery_rate"] = {"value": dr}

        if "bounce_rate" in metrics:
            br = _safe_rate(curr_failed, curr_sent + curr_failed)
            data["bounce_rate"] = {"value": br}

        if "opt_out_rate" in metrics:
            opt_outs = int((boosts_doc.get("boosts") or {}).get("quick_stats.opt_outs", 0))
            opt_outs += sum(day.get("opt_outs", 0) for day in daily.values())
            data["opt_out_rate"] = {
                "value": _safe_rate(opt_outs, curr_sent) if curr_sent else None,
            }

    # Analytics-based metrics (open_rate, ctr)
    if needs_analytics:
        boosts_doc = results.get("boosts_doc") or {}
        analytics = boosts_doc.get("analytics") or {}
        override_open = analytics.get("avg_open_rate")
        override_ctr = analytics.get("avg_ctr")

        if "open_rate" in metrics:
            data["open_rate"] = (
                {"value": round(override_open * 100, 1), "tracked": True}
                if override_open is not None
                else {"value": None, "tracked": False}
            )

        if "ctr" in metrics:
            data["ctr"] = (
                {"value": round(override_ctr * 100, 1), "tracked": True}
                if override_ctr is not None
                else {"value": None, "tracked": False}
            )

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

_CAMPAIGN_DEMO_RANGES: dict[str, tuple[int, int]] = {
    "email":    (100_000, 500_000),
    "push":     (50_000,  200_000),
    "sms":      (30_000,  150_000),
    "whatsapp": (20_000,  100_000),
    "telegram": (5_000,    50_000),
    "in_app":   (50_000,  250_000),
}
_CAMPAIGN_DEMO_RATES: dict[str, tuple[float, float, float, float]] = {
    "email":    (0.22, 0.06, 0.035, 0.010),
    "push":     (0.17, 0.04, 0.045, 0.012),
    "sms":      (0.28, 0.06, 0.038, 0.008),
    "whatsapp": (0.38, 0.08, 0.075, 0.015),
    "telegram": (0.33, 0.07, 0.060, 0.012),
    "in_app":   (0.55, 0.10, 0.115, 0.020),
}
_DAILY_WEIGHTS = [0.12, 0.15, 0.16, 0.14, 0.18, 0.13, 0.12]


def _demo_sent(campaign_id: str, channel: str) -> int:
    seed = int(hashlib.md5(campaign_id.encode()).hexdigest()[:8], 16)
    lo, hi = _CAMPAIGN_DEMO_RANGES.get(channel, (10_000, 100_000))
    return lo + (seed % (hi - lo))


def _demo_rates(campaign_id: str, channel: str) -> tuple[float, float]:
    seed = int(hashlib.md5((campaign_id + "rates").encode()).hexdigest()[:8], 16)
    or_base, or_var, ctr_base, ctr_var = _CAMPAIGN_DEMO_RATES.get(channel, (0.20, 0.05, 0.040, 0.010))
    return (
        round(or_base + (seed % 1000) / 1000 * or_var, 4),
        round(ctr_base + ((seed >> 16) % 1000) / 1000 * ctr_var, 4),
    )


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/reports/campaign-stats
# ---------------------------------------------------------------------------

@router.get("/campaign-stats")
async def get_campaign_stats(
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
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
        curr_raw, prev_raw, daily_range, boosts_doc,
        campaign_docs, run_rows,
    ) = await asyncio.gather(
        get_dashboard_delivery_stats(db, project_id, since, now),
        get_dashboard_delivery_stats(db, project_id, prev_since, since),
        get_daily_boosts_range(db, project_id, since, now),
        db["dashboard_boosts"].find_one({"project_id": project_id}, {"_id": 0, "boosts": 1, "analytics": 1}),
        db["campaigns"].find(campaign_query, {"_id": 0, "campaign_id": 1, "name": 1, "channel": 1, "status": 1, "audience": 1})
            .sort("updated_at", -1).skip(offset).limit(limit).to_list(length=None),
        db["campaign_runs"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": "$campaign_id", "total_sent": {"$sum": "$sent_count"}}},
        ]).to_list(length=None),
    )

    boosts_doc = boosts_doc or {}
    analytics_cfg = boosts_doc.get("analytics") or {}
    flat_boosts   = boosts_doc.get("boosts") or {}

    # ── Summary ─────────────────────────────────────────────────────────────
    curr = _crunch_deliveries(curr_raw)
    prev = _crunch_deliveries(prev_raw)
    daily = daily_range or {}

    win_scale  = window_days / 30
    boost_sent = int(flat_boosts.get("quick_stats.messages_sent", 0))
    daily_sent = sum(day.get("messages_sent", 0) for day in daily.values())

    curr_sent  = _sum_status(curr, "sent") + daily_sent + round(boost_sent * win_scale)
    prev_sent  = _sum_status(prev, "sent")  + round(boost_sent * win_scale)

    override_open = analytics_cfg.get("avg_open_rate")
    override_ctr  = analytics_cfg.get("avg_ctr")

    summary = {
        "total_sent": {
            "value":      curr_sent,
            "change_pct": _change_pct(curr_sent, prev_sent),
        },
        "avg_open_rate": (
            {"value": round(override_open * 100, 1), "change_pct": None, "tracked": True}
            if override_open is not None
            else {"value": None, "tracked": False}
        ),
        "avg_ctr": (
            {"value": round(override_ctr * 100, 1), "change_pct": None, "tracked": True}
            if override_ctr is not None
            else {"value": None, "tracked": False}
        ),
        "conversions":       {"value": None, "tracked": False},
        "revenue_influenced": {"value": None, "tracked": False},
    }

    # ── Trend (primary/secondary/tertiary by channel tier) ──────────────────
    window_dates = [str((since + timedelta(days=i)).date()) for i in range(window_days)]
    total_w = sum(_DAILY_WEIGHTS[datetime.strptime(d, "%Y-%m-%d").weekday()] for d in window_dates)
    daily_avg = int(analytics_cfg.get("daily_avg_sent", 0))

    # Per-channel daily data from daily_boosts
    trend: list[dict] = []
    for date_str in window_dates:
        day_boosts = daily.get(date_str, {})
        ch_data    = day_boosts.get("channel", {})

        # Base from real notification_deliveries grouped by date/channel
        real_by_ch: dict[str, int] = {}
        for ch, statuses in curr.items():
            for st, dates in statuses.items():
                if st == "sent" and date_str in dates:
                    real_by_ch[ch] = real_by_ch.get(ch, 0) + dates[date_str]

        # Fallback boost allocation split equally across tier channels
        fallback = 0
        if daily_avg > 0:
            w = _DAILY_WEIGHTS[datetime.strptime(date_str, "%Y-%m-%d").weekday()]
            fallback = round(daily_avg * w / total_w / len(_CHANNEL_TIERS))

        point: dict[str, Any] = {"date": date_str}
        for tier, ch in zip(_TIER_LABELS, _CHANNEL_TIERS):
            boost_val = ch_data.get(ch, {}).get("sent", 0)
            real_val  = real_by_ch.get(ch, 0)
            point[tier] = boost_val + real_val + (fallback if not boost_val and not real_val else 0)
        trend.append(point)

    # ── Campaign table ────────────────────────────────────────────────────────
    sent_by_campaign = {r["_id"]: r["total_sent"] for r in run_rows}
    campaigns_out = []
    for d in campaign_docs:
        cid  = d["campaign_id"]
        ch   = d["channel"]
        open_rate, ctr = _demo_rates(cid, ch)
        real_sent = sent_by_campaign.get(cid, 0)
        total = real_sent + _demo_sent(cid, ch)
        campaigns_out.append({
            "campaign_id": cid,
            "name":        d["name"],
            "channel":     ch,
            "sent":        total,
            "open_rate":   open_rate,
            "ctr":         ctr,
            "conversions": None,
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
