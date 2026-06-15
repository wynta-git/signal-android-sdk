import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import PortalAuthDep, get_db
from app.models import CreateReportRequest, CustomReport, ReportFilters, UpdateReportRequest
from shared.clients.mongo import get_dashboard_delivery_stats

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
    ) = await asyncio.gather(
        get_dashboard_delivery_stats(db, project_id, since, now),
        get_dashboard_delivery_stats(db, project_id, prev_since, since),
        db["campaigns"].find(campaign_query, {"_id": 0, "campaign_id": 1, "name": 1, "channel": 1, "status": 1, "audience": 1})
            .sort("updated_at", -1).skip(offset).limit(limit).to_list(length=None),
        db["campaign_runs"].aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": "$campaign_id", "total_sent": {"$sum": "$sent_count"}}},
        ]).to_list(length=None),
    )

    # ── Summary ─────────────────────────────────────────────────────────────
    curr = _crunch_deliveries(curr_raw)
    prev = _crunch_deliveries(prev_raw)

    curr_sent = _sum_status(curr, "sent")
    prev_sent = _sum_status(prev, "sent")

    summary = {
        "total_sent": {
            "value":      curr_sent,
            "change_pct": _change_pct(curr_sent, prev_sent),
        },
        "avg_open_rate":     {"value": None, "tracked": False},
        "avg_ctr":           {"value": None, "tracked": False},
        "conversions":       {"value": None, "tracked": False},
        "revenue_influenced": {"value": None, "tracked": False},
    }

    # ── Trend (primary/secondary/tertiary by channel tier) ──────────────────
    window_dates = [str((since + timedelta(days=i)).date()) for i in range(window_days)]

    trend: list[dict] = []
    for date_str in window_dates:
        real_by_ch: dict[str, int] = {}
        for ch, statuses in curr.items():
            for st, dates in statuses.items():
                if st == "sent" and date_str in dates:
                    real_by_ch[ch] = real_by_ch.get(ch, 0) + dates[date_str]

        point: dict[str, Any] = {"date": date_str}
        for tier, ch in zip(_TIER_LABELS, _CHANNEL_TIERS):
            point[tier] = real_by_ch.get(ch, 0)
        trend.append(point)

    # ── Campaign table ────────────────────────────────────────────────────────
    sent_by_campaign = {r["_id"]: r["total_sent"] for r in run_rows}
    campaigns_out = []
    for d in campaign_docs:
        cid = d["campaign_id"]
        campaigns_out.append({
            "campaign_id": cid,
            "name":        d["name"],
            "channel":     d["channel"],
            "sent":        sent_by_campaign.get(cid, 0),
            "open_rate":   None,
            "ctr":         None,
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
# GET /projects/{project_id}/reports/channel-delivery
# ---------------------------------------------------------------------------

_ALL_CHANNELS = ("email", "push", "sms", "whatsapp", "telegram", "in_app")


@router.get("/channel-delivery")
async def get_channel_delivery(
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
    window_days: int = Query(default=7, ge=1, le=90),
    channel: str = Query(default="all"),
    segment_id: str | None = Query(default=None),
) -> dict:
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Project mismatch"})

    now        = datetime.now(timezone.utc)
    since      = now - timedelta(days=window_days)
    prev_since = since - timedelta(days=window_days)

    curr_raw, prev_raw = await asyncio.gather(
        get_dashboard_delivery_stats(db, project_id, since, now),
        get_dashboard_delivery_stats(db, project_id, prev_since, since),
    )

    curr = _crunch_deliveries(curr_raw)
    prev = _crunch_deliveries(prev_raw)

    if channel != "all":
        curr = {k: v for k, v in curr.items() if k == channel}
        prev = {k: v for k, v in prev.items() if k == channel}

    # ── Summary ─────────────────────────────────────────────────────────────
    curr_sent   = _sum_status(curr, "sent")
    prev_sent   = _sum_status(prev, "sent")
    curr_failed = _sum_status(curr, "failed")

    active_channels = sum(
        1 for ch_data in curr.values()
        if "sent" in ch_data and sum(ch_data["sent"].values()) > 0
    )
    known_set   = set(_ALL_CHANNELS)
    active_set  = {ch for ch, ch_data in curr.items() if "sent" in ch_data and sum(ch_data["sent"].values()) > 0}
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
        for tier, ch in zip(_TIER_LABELS, _CHANNEL_TIERS):
            point[tier] = real_by_ch.get(ch, 0)
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
        channels_out.append({
            "channel":       ch_key,
            "messages":      ch_total,
            "delivery_rate": _safe_rate(ch_sent, ch_total),
            "bounce_rate":   _safe_rate(ch_failed, ch_total),
            "open_rate":     None,
            "ctr":           None,
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
