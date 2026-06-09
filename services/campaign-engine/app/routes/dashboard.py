import asyncio
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import PortalAuthDep, get_db
from shared.clients.mongo import (
    get_dashboard_channel_optin,
    get_dashboard_delivery_stats,
    get_dashboard_user_health,
)

log = structlog.get_logger()

router = APIRouter(
    prefix="/projects/{project_id}/dashboard",
    tags=["dashboard"],
)

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]

_UNTRACKED: dict[str, Any] = {"value": None, "tracked": False}


def _safe_pct(part: int, total: int) -> float | None:
    if not total:
        return None
    return round(part / total, 4)


def _safe_rate(numerator: int, denominator: int) -> float | None:
    if not denominator:
        return None
    return round(numerator / denominator, 4)


def _change_pct(current: int | float, previous: int | float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def _crunch_deliveries(raw: list[dict]) -> dict:
    """Turn raw aggregation buckets into: result[channel][status][date] = count."""
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


_BOOSTABLE_FIELDS: frozenset[str] = frozenset({
    "quick_stats.reachable_players",
    "quick_stats.active_this_week",
    "quick_stats.live_campaigns",
    "quick_stats.active_segments",
    "quick_stats.messages_sent",
    "player_health.total_users",
    "player_health.new",
    "player_health.healthy",
    "player_health.at_risk",
    "player_health.churned",
    "channel_optin.push",
    "channel_optin.email",
    "channel_optin.sms",
    "quick_stats.opt_outs",
})


async def _fetch_boosts(db: AsyncIOMotorDatabase, project_id: str) -> dict[str, int]:
    doc = await db["dashboard_boosts"].find_one(
        {"project_id": project_id},
        {"_id": 0, "boosts": 1},
    )
    return (doc or {}).get("boosts", {})


def _b(boosts: dict, key: str) -> int:
    return int(boosts.get(key, 0))


async def _fetch_segment_names(
    db: AsyncIOMotorDatabase, project_id: str, segment_ids: list[str]
) -> dict[str, str]:
    if not segment_ids:
        return {}
    docs = await db["segments"].find(
        {"project_id": project_id, "segment_id": {"$in": segment_ids}},
        {"_id": 0, "segment_id": 1, "name": 1},
    ).to_list(length=None)
    return {d["segment_id"]: d["name"] for d in docs}


# ---------------------------------------------------------------------------
# GET /summary
# ---------------------------------------------------------------------------


@router.get("/summary")
async def dashboard_summary(
    ctx: PortalAuthDep,
    db: DbDep,
    window_days: int = Query(default=7, ge=1, le=90),
) -> dict:
    project_id = ctx.project_id
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=window_days)
    prev_since = since - timedelta(days=window_days)

    (
        curr_raw,
        prev_raw,
        health,
        optin,
        live_campaign_count,
        active_segment_count,
        active_this_week,
        prev_active_this_week,
        total_users,
        reachable_count,
        prev_reachable_count,
        boosts,
    ) = await asyncio.gather(
        get_dashboard_delivery_stats(db, project_id, since, now),
        get_dashboard_delivery_stats(db, project_id, prev_since, since),
        get_dashboard_user_health(db, project_id),
        get_dashboard_channel_optin(db, project_id),
        db["campaigns"].count_documents(
            {"project_id": project_id, "status": {"$in": ["running", "scheduled"]}}
        ),
        db["segments"].count_documents({"project_id": project_id}),
        db["users"].count_documents(
            {"project_id": project_id, "last_seen_at": {"$gte": since}}
        ),
        db["users"].count_documents(
            {"project_id": project_id, "last_seen_at": {"$gte": prev_since, "$lt": since}}
        ),
        db["users"].count_documents({"project_id": project_id}),
        db["users"].count_documents({
            "project_id": project_id,
            "$or": [
                {"traits.email_hash": {"$exists": True, "$ne": None}},
                {"traits.phone_hash": {"$exists": True, "$ne": None}},
            ],
        }),
        db["users"].count_documents({
            "project_id": project_id,
            "$or": [
                {"traits.email_hash": {"$exists": True, "$ne": None}},
                {"traits.phone_hash": {"$exists": True, "$ne": None}},
            ],
        }),
        _fetch_boosts(db, project_id),
    )

    curr = _crunch_deliveries(curr_raw)
    prev = _crunch_deliveries(prev_raw)

    curr_sent = _sum_status(curr, "sent")
    prev_sent = _sum_status(prev, "sent")
    curr_failed = _sum_status(curr, "failed")

    # Reachable = email/phone users union push users, capped at total_users
    reachable = min(reachable_count + optin["push"], total_users)
    prev_reachable = min(prev_reachable_count + optin["push"], total_users)

    # Apply boosts — same offset added to both current and previous so change_pct stays consistent
    b_reachable      = reachable + _b(boosts, "quick_stats.reachable_players")
    b_prev_reachable = prev_reachable + _b(boosts, "quick_stats.reachable_players")
    b_active         = active_this_week + _b(boosts, "quick_stats.active_this_week")
    b_prev_active    = prev_active_this_week + _b(boosts, "quick_stats.active_this_week")
    b_curr_sent      = curr_sent + _b(boosts, "quick_stats.messages_sent")
    b_prev_sent      = prev_sent + _b(boosts, "quick_stats.messages_sent")
    b_total_users    = health["total_users"] + _b(boosts, "player_health.total_users")
    b_new            = health["new"] + _b(boosts, "player_health.new")
    b_healthy        = health["healthy"] + _b(boosts, "player_health.healthy")
    b_at_risk        = health["at_risk"] + _b(boosts, "player_health.at_risk")
    b_churned        = health["churned"] + _b(boosts, "player_health.churned")
    btotal           = b_total_users or 1

    return {
        "window_days": window_days,
        "quick_stats": {
            "reachable_players": {
                "value": b_reachable,
                "change_pct": _change_pct(b_reachable, b_prev_reachable),
            },
            "active_this_week": {
                "value": b_active,
                "change_pct": _change_pct(b_active, b_prev_active),
                "approximate": True,
            },
            "live_campaigns": {"value": live_campaign_count + _b(boosts, "quick_stats.live_campaigns")},
            "active_segments": {"value": active_segment_count + _b(boosts, "quick_stats.active_segments")},
            "messages_sent": {
                "value": b_curr_sent,
                "change_pct": _change_pct(b_curr_sent, b_prev_sent),
            },
            "delivery_rate": {
                "value": _safe_rate(curr_sent, curr_sent + curr_failed),
            },
            "open_rate": _UNTRACKED,
            "ctr": _UNTRACKED,
            "opt_outs": {"value": _b(boosts, "quick_stats.opt_outs") or None, "tracked": _b(boosts, "quick_stats.opt_outs") > 0},
            "player_responses": _UNTRACKED,
        },
        "player_health": {
            "approximate": True,
            "total_users": b_total_users,
            "new":     {"count": b_new,     "pct": _safe_pct(b_new,     btotal)},
            "healthy": {"count": b_healthy, "pct": _safe_pct(b_healthy, btotal)},
            "at_risk": {"count": b_at_risk, "pct": _safe_pct(b_at_risk, btotal)},
            "churned": {"count": b_churned, "pct": _safe_pct(b_churned, btotal)},
            "at_risk_contacted_pct": None,
            "reengagement_rate": None,
            "winback_success_rate": None,
        },
        "channel_optin": {
            "push":  {"count": optin["push"] + _b(boosts, "channel_optin.push")},
            "email": {"count": optin["email"] + _b(boosts, "channel_optin.email"), "approximate": True},
            "sms":   {"count": optin["sms"] + _b(boosts, "channel_optin.sms"),     "approximate": True},
        },
    }


# ---------------------------------------------------------------------------
# GET /channels
# ---------------------------------------------------------------------------

# TODO: replace with real per-channel opt-in tracking tomorrow
_CHANNEL_DEFAULTS: list[dict] = [
    {"channel": "email",    "reach_pct": 0.80, "status": "live",   "messages_sent": 28500, "delivery_rate": 0.942},
    {"channel": "push",     "reach_pct": 0.62, "status": "live",   "messages_sent": 18200, "delivery_rate": 0.918},
    {"channel": "sms",      "reach_pct": 0.30, "status": "paused", "messages_sent":  9400, "delivery_rate": 0.971},
    {"channel": "whatsapp", "reach_pct": 0.20, "status": "live",   "messages_sent":  6800, "delivery_rate": 0.964},
    {"channel": "telegram", "reach_pct": 0.08, "status": "live",   "messages_sent":  2100, "delivery_rate": 0.982},
    {"channel": "in_app",   "reach_pct": 0.55, "status": "live",   "messages_sent": 14600, "delivery_rate": 0.991},
]


@router.get("/channels")
async def dashboard_channels(
    ctx: PortalAuthDep,
    db: DbDep,
    window_days: int = Query(default=7, ge=1, le=90),
) -> dict:
    project_id = ctx.project_id
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=window_days)

    raw = await get_dashboard_delivery_stats(db, project_id, since, now)
    buckets = _crunch_deliveries(raw)

    channels = []
    for default in _CHANNEL_DEFAULTS:
        ch = default["channel"]
        ch_data = buckets.get(ch, {})

        sent_by_date: dict[str, int] = {}
        failed_by_date: dict[str, int] = {}
        for status, dates in ch_data.items():
            for date, count in dates.items():
                if status == "sent":
                    sent_by_date[date] = sent_by_date.get(date, 0) + count
                elif status == "failed":
                    failed_by_date[date] = failed_by_date.get(date, 0) + count

        total_sent = sum(sent_by_date.values())
        total_failed = sum(failed_by_date.values())
        all_dates = sorted(set(list(sent_by_date) + list(failed_by_date)))
        trend = [
            {"date": d, "sent": sent_by_date.get(d, 0), "failed": failed_by_date.get(d, 0)}
            for d in all_dates
        ]

        channels.append({
            "channel": ch,
            "opted_in_users": None,
            "reach_pct": default["reach_pct"],
            "status": default["status"],
            "messages_sent": total_sent if total_sent > 0 else default["messages_sent"],
            "delivery_rate": _safe_rate(total_sent, total_sent + total_failed) if total_sent > 0 else default["delivery_rate"],
            "open_rate": None,
            "ctr": None,
            "trend_7d": trend,
        })

    return {"window_days": window_days, "channels": channels}


# ---------------------------------------------------------------------------
# GET /segments
# ---------------------------------------------------------------------------


@router.get("/segments")
async def dashboard_segments(
    ctx: PortalAuthDep,
    db: DbDep,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    brand_id: str | None = None,
) -> dict:
    project_id = ctx.project_id
    query: dict = {"project_id": project_id}
    if brand_id:
        query["brand_id"] = brand_id

    total, total_members_agg, docs = await asyncio.gather(
        db["segments"].count_documents(query),
        db["segments"].aggregate([
            {"$match": query},
            {"$group": {"_id": None, "total": {"$sum": "$members_count"}}},
        ]).to_list(length=1),
        db["segments"]
        .find(query, {"_id": 0, "segment_id": 1, "name": 1, "members_count": 1})
        .sort("members_count", -1)
        .skip(offset)
        .limit(limit)
        .to_list(length=None),
    )

    total_members = total_members_agg[0]["total"] if total_members_agg else 0

    segments = [
        {
            "segment_id": d["segment_id"],
            "name": d["name"],
            "members_count": d.get("members_count") or 0,
            "pct": _safe_pct(d.get("members_count") or 0, total_members),
        }
        for d in docs
    ]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "total_members_across_segments": total_members,
        "segments": segments,
    }


# ---------------------------------------------------------------------------
# GET /campaigns
# ---------------------------------------------------------------------------


@router.get("/campaigns")
async def dashboard_campaigns(
    ctx: PortalAuthDep,
    db: DbDep,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str = Query(default="running,scheduled"),
    brand_id: str | None = None,
) -> dict:
    project_id = ctx.project_id
    status_list = [s.strip() for s in status.split(",") if s.strip()]

    query: dict = {"project_id": project_id, "status": {"$in": status_list}}
    if brand_id:
        query["brand_id"] = brand_id

    total, campaign_docs = await asyncio.gather(
        db["campaigns"].count_documents(query),
        db["campaigns"]
        .find(
            query,
            {"_id": 0, "campaign_id": 1, "name": 1, "channel": 1,
             "status": 1, "audience": 1, "updated_at": 1},
        )
        .sort("updated_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(length=None),
    )

    if not campaign_docs:
        return {"total": total, "limit": limit, "offset": offset, "campaigns": []}

    campaign_ids = [d["campaign_id"] for d in campaign_docs]
    segment_ids = list({
        d["audience"]["segment_id"]
        for d in campaign_docs
        if (d.get("audience") or {}).get("segment_id")
    })

    run_rows, name_by_segment = await asyncio.gather(
        db["campaign_runs"].aggregate([
            {"$match": {"project_id": project_id, "campaign_id": {"$in": campaign_ids}}},
            {"$group": {"_id": "$campaign_id", "total_sent": {"$sum": "$sent_count"}}},
        ]).to_list(length=None),
        _fetch_segment_names(db, project_id, segment_ids),
    )

    sent_by_campaign = {r["_id"]: r["total_sent"] for r in run_rows}

    campaigns = []
    for d in campaign_docs:
        seg_id = (d.get("audience") or {}).get("segment_id")
        campaigns.append({
            "campaign_id": d["campaign_id"],
            "name": d["name"],
            "channel": d["channel"],
            "segment_id": seg_id,
            "segment_name": name_by_segment.get(seg_id) if seg_id else None,
            "total_sent": sent_by_campaign.get(d["campaign_id"], 0),
            "status": d["status"],
            "open_rate": None,
            "ctr": None,
            "click_throughs": None,
        })

    campaigns.sort(key=lambda c: c["total_sent"], reverse=True)
    return {"total": total, "limit": limit, "offset": offset, "campaigns": campaigns}


# ---------------------------------------------------------------------------
# GET /analytics
# ---------------------------------------------------------------------------


@router.get("/analytics")
async def dashboard_analytics(
    ctx: PortalAuthDep,
    db: DbDep,
    window_days: int = Query(default=30, ge=1, le=365),
) -> dict:
    project_id = ctx.project_id
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=window_days)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # First day of previous month
    prev_month_start = (month_start - timedelta(days=1)).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )

    raw, mtd_raw, prev_mtd_raw = await asyncio.gather(
        get_dashboard_delivery_stats(db, project_id, since, now),
        get_dashboard_delivery_stats(db, project_id, month_start, now),
        get_dashboard_delivery_stats(db, project_id, prev_month_start, month_start),
    )

    buckets = _crunch_deliveries(raw)
    mtd = _crunch_deliveries(mtd_raw)
    prev_mtd = _crunch_deliveries(prev_mtd_raw)

    # Daily totals across all channels
    daily_sent: dict[str, int] = {}
    daily_failed: dict[str, int] = {}
    for ch_data in buckets.values():
        for st, dates in ch_data.items():
            for date, count in dates.items():
                if st == "sent":
                    daily_sent[date] = daily_sent.get(date, 0) + count
                elif st == "failed":
                    daily_failed[date] = daily_failed.get(date, 0) + count

    all_dates = sorted(set(list(daily_sent) + list(daily_failed)))
    daily = [
        {"date": d, "sent": daily_sent.get(d, 0), "failed": daily_failed.get(d, 0)}
        for d in all_dates
    ]

    mtd_sent = _sum_status(mtd, "sent")
    prev_mtd_sent = _sum_status(prev_mtd, "sent")
    mtd_failed = _sum_status(mtd, "failed")

    return {
        "window_days": window_days,
        "daily": daily,
        "mtd": {
            "messages_sent": {
                "value": mtd_sent,
                "change_pct": _change_pct(mtd_sent, prev_mtd_sent),
            },
            "avg_delivery_rate": {
                "value": _safe_rate(mtd_sent, mtd_sent + mtd_failed),
            },
            "avg_open_rate": _UNTRACKED,
            "avg_ctr": _UNTRACKED,
        },
    }


# ---------------------------------------------------------------------------
# GET /boosts  PUT /boosts
# ---------------------------------------------------------------------------


@router.get("/boosts")
async def get_dashboard_boosts(ctx: PortalAuthDep, db: DbDep) -> dict:
    boosts = await _fetch_boosts(db, ctx.project_id)
    return {
        "project_id": ctx.project_id,
        "boosts": boosts,
        "supported_fields": sorted(_BOOSTABLE_FIELDS),
    }


@router.put("/boosts")
async def set_dashboard_boosts(ctx: PortalAuthDep, db: DbDep, body: dict) -> dict:
    boosts: dict = body.get("boosts", {})
    invalid = set(boosts) - _BOOSTABLE_FIELDS
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unsupported boost fields: {sorted(invalid)}")
    for key, val in boosts.items():
        if not isinstance(val, int) or val < 0:
            raise HTTPException(
                status_code=422,
                detail=f"Boost value for '{key}' must be a non-negative integer",
            )
    await db["dashboard_boosts"].update_one(
        {"project_id": ctx.project_id},
        {"$set": {"boosts": boosts, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"project_id": ctx.project_id, "boosts": boosts}
