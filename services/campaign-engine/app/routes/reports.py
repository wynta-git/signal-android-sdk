import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
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
