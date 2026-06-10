import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import PortalAuthDep, get_db
from shared.clients.mongo import (
    get_daily_boosts_range,
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
    result = round((current - previous) / previous * 100, 1)
    # Values beyond ±9999 % are data artifacts (near-zero prior period) — suppress them
    return result if abs(result) <= 9999 else None


def _parse_compare_window(
    compare_start: str | None,
    compare_end: str | None,
    fallback_since: datetime,
    fallback_until: datetime,
) -> tuple[datetime, datetime]:
    if compare_start and compare_end:
        try:
            cs = datetime.strptime(compare_start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            ce = (datetime.strptime(compare_end, "%Y-%m-%d") + timedelta(days=1)).replace(tzinfo=timezone.utc)
            return cs, ce
        except ValueError:
            pass
    return fallback_since, fallback_until


def _resolve_window(
    start_date: str | None,
    end_date: str | None,
    window_days: int,
) -> tuple[datetime, datetime, int]:
    """Return (since, until, effective_days) from explicit dates or rolling window."""
    if start_date and end_date:
        try:
            since = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            until = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)).replace(tzinfo=timezone.utc)
            return since, until, max(1, (until - since).days)
        except ValueError:
            pass
    now = datetime.now(timezone.utc)
    return now - timedelta(days=window_days), now, window_days


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


_DAILY_CHANNELS = ("email", "push", "sms", "whatsapp", "telegram", "in_app")


def _crunch_daily_boosts(daily: dict) -> dict:
    """Aggregate daily_boosts entries into summed totals + last-day snapshot."""
    totals: dict = {
        "messages_sent": 0,
        "new_users": 0,
        "opt_outs": 0,
        "channel": {ch: {"sent": 0, "delivered": 0, "failed": 0} for ch in _DAILY_CHANNELS},
        "snapshot": {},
    }
    delivery_rate_samples: list[float] = []
    for date_str in sorted(daily):
        day = daily[date_str]
        totals["messages_sent"] += day.get("messages_sent", 0)
        totals["new_users"]     += day.get("new_users", 0)
        totals["opt_outs"]      += day.get("opt_outs", 0)
        for ch, stats in day.get("channel", {}).items():
            if ch in totals["channel"]:
                for k in ("sent", "delivered", "failed"):
                    totals["channel"][ch][k] += stats.get(k, 0)
        if "snapshot" in day:
            totals["snapshot"] = day["snapshot"]
            dr = day["snapshot"].get("delivery_rate")
            if dr is not None:
                delivery_rate_samples.append(float(dr))
    # Average of per-day delivery_rate snapshots — varies by date range
    totals["avg_delivery_rate"] = (
        round(sum(delivery_rate_samples) / len(delivery_rate_samples), 4)
        if delivery_rate_samples else None
    )
    return totals


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


async def _fetch_analytics_defaults(db: AsyncIOMotorDatabase, project_id: str) -> dict:
    doc = await db["dashboard_boosts"].find_one(
        {"project_id": project_id},
        {"_id": 0, "analytics": 1},
    )
    return (doc or {}).get("analytics", {})


def _b(boosts: dict, key: str) -> int:
    return int(boosts.get(key, 0))


# Mon=0 … Sun=6 — weekdays get more volume than weekends
_DOW_WEIGHTS = [1.2, 1.4, 1.4, 1.3, 1.2, 0.8, 0.7]


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
    start_date:    str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date:      str | None = Query(default=None, description="YYYY-MM-DD"),
    compare_start: str | None = Query(default=None, description="YYYY-MM-DD"),
    compare_end:   str | None = Query(default=None, description="YYYY-MM-DD"),
) -> dict:
    project_id = ctx.project_id
    since, now, window_days = _resolve_window(start_date, end_date, window_days)
    prev_since = since - timedelta(days=window_days)
    comp_since, comp_until = _parse_compare_window(compare_start, compare_end, prev_since, since)

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
        daily_range,
        prev_daily_range,
    ) = await asyncio.gather(
        get_dashboard_delivery_stats(db, project_id, since, now),
        get_dashboard_delivery_stats(db, project_id, comp_since, comp_until),
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
            {"project_id": project_id, "last_seen_at": {"$gte": comp_since, "$lt": comp_until}}
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
        get_daily_boosts_range(db, project_id, since, now),
        get_daily_boosts_range(db, project_id, comp_since, comp_until),
    )

    curr = _crunch_deliveries(curr_raw)
    prev = _crunch_deliveries(prev_raw)

    curr_sent   = _sum_status(curr, "sent")
    prev_sent   = _sum_status(prev, "sent")
    curr_failed = _sum_status(curr, "failed")
    prev_failed = _sum_status(prev, "failed")
    # prev_delivery_rate is refined below once prev_db_totals is available
    prev_delivery_rate: float | None = _safe_rate(prev_sent, prev_sent + prev_failed)

    # Reachable = email/phone users union push users, capped at total_users
    reachable = min(reachable_count + optin["push"], total_users)
    prev_reachable = min(prev_reachable_count + optin["push"], total_users)

    # Apply daily boosts if data exists for this range, else fall back to flat boosts
    db_totals      = _crunch_daily_boosts(daily_range)
    prev_db_totals = _crunch_daily_boosts(prev_daily_range)
    use_daily = db_totals["messages_sent"] > 0

    if use_daily:
        snap      = db_totals["snapshot"]
        prev_snap = prev_db_totals["snapshot"]
        all_ch_sent      = sum(db_totals["channel"][c]["sent"]      for c in _DAILY_CHANNELS)
        all_ch_delivered = sum(db_totals["channel"][c]["delivered"] for c in _DAILY_CHANNELS)
        all_ch_failed    = sum(db_totals["channel"][c]["failed"]    for c in _DAILY_CHANNELS)

        b_reachable      = snap.get("reachable_players", reachable)
        b_prev_reachable = prev_snap.get("reachable_players", prev_reachable)
        b_active         = snap.get("active_users", active_this_week)
        b_prev_active    = prev_active_this_week
        b_curr_sent      = curr_sent + db_totals["messages_sent"]
        b_prev_sent      = prev_sent + prev_db_totals["messages_sent"]
        b_total_users      = snap.get("total_users", health["total_users"])
        prev_b_total_users = prev_snap.get("total_users", health["total_users"])
        b_new            = health["new"] + db_totals["new_users"]
        b_healthy        = health["healthy"] + _b(boosts, "player_health.healthy")
        b_at_risk        = health["at_risk"] + _b(boosts, "player_health.at_risk")
        b_churned        = health["churned"] + _b(boosts, "player_health.churned")
        b_optin_push      = snap.get("optin_push",  optin["push"]  + _b(boosts, "channel_optin.push"))
        b_optin_email     = snap.get("optin_email", optin["email"] + _b(boosts, "channel_optin.email"))
        b_optin_sms       = snap.get("optin_sms",   optin["sms"]   + _b(boosts, "channel_optin.sms"))
        b_opt_outs        = db_totals["opt_outs"]
        prev_b_optin_push = prev_snap.get("optin_push", optin["push"] + _b(boosts, "channel_optin.push"))
        prev_b_opt_outs   = prev_db_totals["opt_outs"]
        prev_ch_delivered = sum(prev_db_totals["channel"][c]["delivered"] for c in _DAILY_CHANNELS)
        prev_ch_failed    = sum(prev_db_totals["channel"][c]["failed"]    for c in _DAILY_CHANNELS)
        _computed_dr      = _safe_rate(
            curr_sent + all_ch_delivered,
            curr_sent + all_ch_delivered + curr_failed + all_ch_failed,
        )
        _computed_prev_dr = _safe_rate(
            prev_sent + prev_ch_delivered,
            prev_sent + prev_ch_delivered + prev_failed + prev_ch_failed,
        )
        delivery_rate      = (
            db_totals["avg_delivery_rate"]
            if db_totals["avg_delivery_rate"] is not None
            else _computed_dr
        )
        prev_delivery_rate = (
            prev_db_totals["avg_delivery_rate"]
            if prev_db_totals["avg_delivery_rate"] is not None
            else _computed_prev_dr
        )
    else:
        win_scale        = window_days / 30
        b_reachable      = reachable + _b(boosts, "quick_stats.reachable_players")
        b_prev_reachable = prev_reachable + _b(boosts, "quick_stats.reachable_players")
        b_active         = active_this_week + _b(boosts, "quick_stats.active_this_week")
        b_prev_active    = prev_active_this_week + _b(boosts, "quick_stats.active_this_week")
        b_curr_sent      = curr_sent + round(_b(boosts, "quick_stats.messages_sent") * win_scale)
        b_prev_sent      = prev_sent + round(_b(boosts, "quick_stats.messages_sent") * win_scale)
        b_total_users    = health["total_users"] + _b(boosts, "player_health.total_users")
        b_new            = health["new"] + round(_b(boosts, "player_health.new") * win_scale)
        b_healthy        = health["healthy"] + _b(boosts, "player_health.healthy")
        b_at_risk        = health["at_risk"] + _b(boosts, "player_health.at_risk")
        b_churned        = health["churned"] + _b(boosts, "player_health.churned")
        b_optin_push      = optin["push"]  + _b(boosts, "channel_optin.push")
        b_optin_email     = optin["email"] + _b(boosts, "channel_optin.email")
        b_optin_sms       = optin["sms"]   + _b(boosts, "channel_optin.sms")
        b_opt_outs         = _b(boosts, "quick_stats.opt_outs")
        prev_b_optin_push  = 0  # flat boost has no period split
        prev_b_opt_outs    = 0  # flat boost has no period split
        prev_b_total_users = b_total_users
        delivery_rate      = _safe_rate(curr_sent, curr_sent + curr_failed)

    btotal      = b_total_users or 1
    prev_btotal = prev_b_total_users or b_total_users or 1

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
                "value": delivery_rate,
                "change_pct": _change_pct(delivery_rate, prev_delivery_rate) if delivery_rate is not None else None,
            },
            "open_rate": _UNTRACKED,
            "ctr": _UNTRACKED,
            "opt_outs": {
                "value": _safe_pct(b_opt_outs, btotal) if b_opt_outs else None,
                "tracked": b_opt_outs > 0,
                "change_pct": _change_pct(
                    _safe_pct(b_opt_outs, btotal) or 0,
                    _safe_pct(prev_b_opt_outs, prev_btotal) or 0,
                ) if b_opt_outs else None,
            },
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
            "push":  {"count": b_optin_push,  "change_pct": _change_pct(b_optin_push, prev_b_optin_push)},
            "email": {"count": b_optin_email, "approximate": True},
            "sms":   {"count": b_optin_sms,   "approximate": True},
        },
    }


# ---------------------------------------------------------------------------
# GET /channels
# ---------------------------------------------------------------------------

# TODO: replace with real per-channel opt-in tracking tomorrow
_CHANNEL_DEFAULTS: list[dict] = [
    {"channel": "email",    "reach_pct": 0.80, "status": "live",   "messages_sent": 1100000, "delivery_rate": 0.942, "open_rate": 0.243, "ctr": 0.038},
    {"channel": "push",     "reach_pct": 0.62, "status": "live",   "messages_sent":  750000, "delivery_rate": 0.918, "open_rate": 0.187, "ctr": 0.052},
    {"channel": "sms",      "reach_pct": 0.30, "status": "paused", "messages_sent":  380000, "delivery_rate": 0.971, "open_rate": 0.312, "ctr": 0.041},
    {"channel": "whatsapp", "reach_pct": 0.20, "status": "live",   "messages_sent":  270000, "delivery_rate": 0.964, "open_rate": 0.425, "ctr": 0.083},
    {"channel": "telegram", "reach_pct": 0.08, "status": "live",   "messages_sent":   85000, "delivery_rate": 0.982, "open_rate": 0.381, "ctr": 0.067},
    {"channel": "in_app",   "reach_pct": 0.55, "status": "live",   "messages_sent":  580000, "delivery_rate": 0.991, "open_rate": 0.614, "ctr": 0.129},
]

_DAILY_WEIGHTS = [0.12, 0.15, 0.16, 0.14, 0.18, 0.13, 0.12]


def _synthetic_trend(total_sent: int, failure_rate: float = 0.05) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    return [
        {
            "date": str(today - timedelta(days=6 - i)),
            "sent": round(total_sent * w),
            "failed": round(total_sent * w * failure_rate),
        }
        for i, w in enumerate(_DAILY_WEIGHTS)
    ]


@router.get("/channels")
async def dashboard_channels(
    ctx: PortalAuthDep,
    db: DbDep,
    window_days: int = Query(default=7, ge=1, le=90),
    start_date:  str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date:    str | None = Query(default=None, description="YYYY-MM-DD"),
) -> dict:
    project_id = ctx.project_id
    since, now, window_days = _resolve_window(start_date, end_date, window_days)

    raw, daily_range = await asyncio.gather(
        get_dashboard_delivery_stats(db, project_id, since, now),
        get_daily_boosts_range(db, project_id, since, now),
    )
    buckets = _crunch_deliveries(raw)
    db_totals = _crunch_daily_boosts(daily_range)

    channels = []
    for default in _CHANNEL_DEFAULTS:
        ch = default["channel"]
        ch_data = buckets.get(ch, {})

        sent_by_date: dict[str, int] = {}
        failed_by_date: dict[str, int] = {}
        for status, dates in ch_data.items():
            for d, count in dates.items():
                if status == "sent":
                    sent_by_date[d] = sent_by_date.get(d, 0) + count
                elif status == "failed":
                    failed_by_date[d] = failed_by_date.get(d, 0) + count

        real_sent   = sum(sent_by_date.values())
        real_failed = sum(failed_by_date.values())

        # Daily boost contribution for this channel
        daily_ch      = db_totals["channel"].get(ch, {})
        daily_sent    = daily_ch.get("sent", 0)
        daily_deliv   = daily_ch.get("delivered", 0)
        daily_failed  = daily_ch.get("failed", 0)

        total_sent   = real_sent + daily_sent
        total_deliv  = daily_deliv
        total_failed = real_failed + daily_failed

        all_dates = sorted(set(list(sent_by_date) + list(failed_by_date)))
        trend = [
            {"date": d, "sent": sent_by_date.get(d, 0), "failed": failed_by_date.get(d, 0)}
            for d in all_dates
        ]

        demo_sent = default["messages_sent"] + total_sent
        if total_sent > 0 or total_deliv > 0:
            delivery_rate = _safe_rate(total_deliv if total_deliv else real_sent,
                                       (total_deliv if total_deliv else real_sent) + total_failed)
        else:
            delivery_rate = default["delivery_rate"]

        channels.append({
            "channel": ch,
            "opted_in_users": None,
            "reach_pct": default["reach_pct"],
            "status": default["status"],
            "messages_sent": demo_sent,
            "delivery_rate": delivery_rate,
            "open_rate": default["open_rate"],
            "ctr": default["ctr"],
            "trend_7d": trend if len(trend) >= 2 else _synthetic_trend(demo_sent, 1 - default["delivery_rate"]),
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


_CAMPAIGN_DEMO_RANGES: dict[str, tuple[int, int]] = {
    "email":     (100_000, 500_000),
    "push":      (50_000,  200_000),
    "sms":       (30_000,  150_000),
    "whatsapp":  (20_000,  100_000),
    "telegram":  (5_000,    50_000),
    "in_app":    (50_000,  250_000),
}

# (open_rate_base, open_rate_variance, ctr_base, ctr_variance) — all as fractions
_CAMPAIGN_DEMO_RATES: dict[str, tuple[float, float, float, float]] = {
    "email":    (0.22, 0.06, 0.035, 0.010),
    "push":     (0.17, 0.04, 0.045, 0.012),
    "sms":      (0.28, 0.06, 0.038, 0.008),
    "whatsapp": (0.38, 0.08, 0.075, 0.015),
    "telegram": (0.33, 0.07, 0.060, 0.012),
    "in_app":   (0.55, 0.10, 0.115, 0.020),
}


def _demo_campaign_sent(campaign_id: str, channel: str) -> int:
    """Deterministic demo baseline keyed on campaign_id so numbers are stable across requests."""
    seed = int(hashlib.md5(campaign_id.encode()).hexdigest()[:8], 16)
    lo, hi = _CAMPAIGN_DEMO_RANGES.get(channel, (10_000, 100_000))
    return lo + (seed % (hi - lo))


def _demo_campaign_rates(campaign_id: str, channel: str) -> tuple[float, float]:
    """Return deterministic (open_rate, ctr) for a campaign, stable across requests."""
    seed = int(hashlib.md5((campaign_id + "rates").encode()).hexdigest()[:8], 16)
    or_base, or_var, ctr_base, ctr_var = _CAMPAIGN_DEMO_RATES.get(
        channel, (0.20, 0.05, 0.040, 0.010)
    )
    open_rate = round(or_base + (seed % 1000) / 1000 * or_var, 4)
    ctr = round(ctr_base + ((seed >> 16) % 1000) / 1000 * ctr_var, 4)
    return open_rate, ctr


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
        total_sent = sent_by_campaign.get(d["campaign_id"], 0) + _demo_campaign_sent(d["campaign_id"], d["channel"])
        open_rate, ctr = _demo_campaign_rates(d["campaign_id"], d["channel"])
        campaigns.append({
            "campaign_id": d["campaign_id"],
            "name": d["name"],
            "channel": d["channel"],
            "segment_id": seg_id,
            "segment_name": name_by_segment.get(seg_id) if seg_id else None,
            "total_sent": total_sent,
            "status": d["status"],
            "open_rate": open_rate,
            "ctr": ctr,
            "click_throughs": round(total_sent * ctr),
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
    start_date:    str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date:      str | None = Query(default=None, description="YYYY-MM-DD"),
    compare_start: str | None = Query(default=None, description="YYYY-MM-DD"),
    compare_end:   str | None = Query(default=None, description="YYYY-MM-DD"),
) -> dict:
    project_id = ctx.project_id
    since, now, window_days = _resolve_window(start_date, end_date, window_days)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # First day of previous month
    prev_month_start = (month_start - timedelta(days=1)).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )

    use_custom_compare = bool(compare_start and compare_end)
    # When explicit dates are selected, default comparison is the equivalent prior period;
    # otherwise fall back to the calendar month-over-month comparison.
    default_comp_since = since - timedelta(days=window_days) if (start_date and end_date) else prev_month_start
    default_comp_until = since if (start_date and end_date) else month_start
    comp_since, comp_until = _parse_compare_window(compare_start, compare_end, default_comp_since, default_comp_until)

    use_window_as_mtd = use_custom_compare or bool(start_date and end_date)

    if use_window_as_mtd:
        raw, comp_raw, daily_range = await asyncio.gather(
            get_dashboard_delivery_stats(db, project_id, since, now),
            get_dashboard_delivery_stats(db, project_id, comp_since, comp_until),
            get_daily_boosts_range(db, project_id, since, now),
        )
        mtd_raw = raw
        prev_mtd_raw = comp_raw
    else:
        raw, mtd_raw, prev_mtd_raw, daily_range = await asyncio.gather(
            get_dashboard_delivery_stats(db, project_id, since, now),
            get_dashboard_delivery_stats(db, project_id, month_start, now),
            get_dashboard_delivery_stats(db, project_id, prev_month_start, month_start),
            get_daily_boosts_range(db, project_id, since, now),
        )

    buckets = _crunch_deliveries(raw)
    mtd = _crunch_deliveries(mtd_raw)
    prev_mtd = _crunch_deliveries(prev_mtd_raw)

    # Daily totals across all channels (real data)
    real_daily_sent: dict[str, int] = {}
    daily_failed: dict[str, int] = {}
    for ch_data in buckets.values():
        for st, dates in ch_data.items():
            for d, count in dates.items():
                if st == "sent":
                    real_daily_sent[d] = real_daily_sent.get(d, 0) + count
                elif st == "failed":
                    daily_failed[d] = daily_failed.get(d, 0) + count

    mtd_sent = _sum_status(mtd, "sent")
    prev_mtd_sent = _sum_status(prev_mtd, "sent")
    mtd_failed = _sum_status(mtd, "failed")

    # ── Analytics boost: daily time series takes priority, daily_avg as fallback ──
    analytics_cfg = await _fetch_analytics_defaults(db, project_id)
    daily_avg     = int(analytics_cfg.get("daily_avg_sent", 0))
    override_open = analytics_cfg.get("avg_open_rate")
    override_ctr  = analytics_cfg.get("avg_ctr")

    window_dates = [str((since + timedelta(days=i)).date()) for i in range(window_days)]

    if daily_range:
        # Per-date daily_boosts — use exact values; fall back to daily_avg for missing dates
        if daily_avg > 0:
            total_w = sum(_DOW_WEIGHTS[datetime.strptime(d, "%Y-%m-%d").weekday()] for d in window_dates)
            total_boost = daily_avg * window_days
        boost_sent: dict[str, int] = {}
        mtd_daily_boost = 0
        for d in window_dates:
            if d in daily_range:
                val = daily_range[d].get("messages_sent", 0)
            elif daily_avg > 0:
                val = round(total_boost * _DOW_WEIGHTS[datetime.strptime(d, "%Y-%m-%d").weekday()] / total_w)
            else:
                val = 0
            boost_sent[d] = val
            if d >= str(month_start.date()):
                mtd_daily_boost += val
        all_dates = sorted(set(list(boost_sent) + list(real_daily_sent) + list(daily_failed)))
        daily = [
            {
                "date": d,
                "sent":   boost_sent.get(d, 0) + real_daily_sent.get(d, 0),
                "failed": daily_failed.get(d, 0),
            }
            for d in all_dates
        ]
        mtd_sent      += mtd_daily_boost
        prev_mtd_sent += mtd_daily_boost  # keep change_pct neutral for demo
    elif daily_avg > 0:
        total_boost  = daily_avg * window_days
        total_w = sum(_DOW_WEIGHTS[datetime.strptime(d, "%Y-%m-%d").weekday()] for d in window_dates)
        base: dict[str, int] = {
            d: round(total_boost * _DOW_WEIGHTS[datetime.strptime(d, "%Y-%m-%d").weekday()] / total_w)
            for d in window_dates
        }
        all_dates = sorted(set(list(base) + list(real_daily_sent) + list(daily_failed)))
        daily = [
            {
                "date": d,
                "sent":   base.get(d, 0) + real_daily_sent.get(d, 0),
                "failed": daily_failed.get(d, 0),
            }
            for d in all_dates
        ]
        mtd_sent      += total_boost
        prev_mtd_sent += total_boost
    else:
        all_dates = sorted(set(list(real_daily_sent) + list(daily_failed)))
        daily = [
            {"date": d, "sent": real_daily_sent.get(d, 0), "failed": daily_failed.get(d, 0)}
            for d in all_dates
        ]

    open_rate_out = (
        {"value": round(override_open * 100, 1), "tracked": True}
        if override_open is not None else _UNTRACKED
    )
    ctr_out = (
        {"value": round(override_ctr * 100, 1), "tracked": True}
        if override_ctr is not None else _UNTRACKED
    )

    # When using window-as-mtd (explicit dates or custom compare), lock prev_mtd_sent
    # to the raw comparison window — no boosts on the comparison side.
    if use_window_as_mtd:
        prev_mtd_sent = _sum_status(_crunch_deliveries(prev_mtd_raw), "sent")

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
            "avg_open_rate": open_rate_out,
            "avg_ctr": ctr_out,
        },
    }


# ---------------------------------------------------------------------------
# GET /boosts  PUT /boosts
# ---------------------------------------------------------------------------


@router.get("/boosts")
async def get_dashboard_boosts(ctx: PortalAuthDep, db: DbDep) -> dict:
    doc = await db["dashboard_boosts"].find_one(
        {"project_id": ctx.project_id},
        {"_id": 0, "boosts": 1, "analytics": 1},
    )
    return {
        "project_id": ctx.project_id,
        "boosts": (doc or {}).get("boosts", {}),
        "analytics": (doc or {}).get("analytics", {}),
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

    analytics: dict = body.get("analytics", {})
    _ALLOWED_ANALYTICS = {"daily_avg_sent", "avg_open_rate", "avg_ctr"}
    invalid_a = set(analytics) - _ALLOWED_ANALYTICS
    if invalid_a:
        raise HTTPException(status_code=422, detail=f"Unsupported analytics fields: {sorted(invalid_a)}")
    if "daily_avg_sent" in analytics:
        if not isinstance(analytics["daily_avg_sent"], int) or analytics["daily_avg_sent"] < 0:
            raise HTTPException(status_code=422, detail="analytics.daily_avg_sent must be a non-negative integer")
    for rate_key in ("avg_open_rate", "avg_ctr"):
        if rate_key in analytics:
            val = analytics[rate_key]
            if not isinstance(val, (int, float)) or val < 0:
                raise HTTPException(status_code=422, detail=f"analytics.{rate_key} must be a non-negative number")

    await db["dashboard_boosts"].update_one(
        {"project_id": ctx.project_id},
        {"$set": {"boosts": boosts, "analytics": analytics, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"project_id": ctx.project_id, "boosts": boosts, "analytics": analytics}


# ---------------------------------------------------------------------------
# GET /boosts/daily  PUT /boosts/daily
# ---------------------------------------------------------------------------

_DAILY_BOOST_INT_FIELDS = frozenset({"messages_sent", "new_users", "opt_outs"})
_DAILY_CHANNEL_INT_FIELDS = frozenset({"sent", "delivered", "failed"})
_DAILY_SNAPSHOT_INT_FIELDS = frozenset({
    "total_users", "active_users", "reachable_players",
    "optin_push", "optin_email", "optin_sms",
})


def _validate_daily_entry(date_str: str, entry: dict) -> None:
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, f"Invalid date key '{date_str}': must be YYYY-MM-DD")

    for field in _DAILY_BOOST_INT_FIELDS:
        if field in entry:
            if not isinstance(entry[field], int) or entry[field] < 0:
                raise HTTPException(422, f"{date_str}.{field} must be a non-negative integer")

    for ch, stats in entry.get("channel", {}).items():
        if ch not in _DAILY_CHANNELS:
            raise HTTPException(422, f"{date_str}.channel: unknown channel '{ch}'")
        for k in _DAILY_CHANNEL_INT_FIELDS:
            if k in stats and (not isinstance(stats[k], int) or stats[k] < 0):
                raise HTTPException(422, f"{date_str}.channel.{ch}.{k} must be a non-negative integer")

    for field in _DAILY_SNAPSHOT_INT_FIELDS:
        snap = entry.get("snapshot", {})
        if field in snap and (not isinstance(snap[field], int) or snap[field] < 0):
            raise HTTPException(422, f"{date_str}.snapshot.{field} must be a non-negative integer")


@router.get("/boosts/daily")
async def get_daily_boosts(
    ctx: PortalAuthDep,
    db: DbDep,
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date:   str | None = Query(default=None, description="YYYY-MM-DD"),
) -> dict:
    doc = await db["dashboard_boosts"].find_one(
        {"project_id": ctx.project_id}, {"_id": 0, "daily_boosts": 1}
    )
    all_daily: dict = (doc or {}).get("daily_boosts", {})

    if start_date or end_date:
        try:
            since = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else None
            until = datetime.strptime(end_date,   "%Y-%m-%d").date() if end_date   else None
        except ValueError:
            raise HTTPException(422, "start_date and end_date must be YYYY-MM-DD")
        from datetime import date as _date
        all_daily = {
            k: v for k, v in all_daily.items()
            if (since is None or _date.fromisoformat(k) >= since)
            and (until is None or _date.fromisoformat(k) <= until)
        }

    return {"project_id": ctx.project_id, "daily_boosts": all_daily}


@router.put("/boosts/daily")
async def upsert_daily_boosts(ctx: PortalAuthDep, db: DbDep, body: dict) -> dict:
    incoming: dict = body.get("daily_boosts", {})
    if not isinstance(incoming, dict):
        raise HTTPException(422, "daily_boosts must be an object keyed by YYYY-MM-DD date strings")

    for date_str, entry in incoming.items():
        _validate_daily_entry(date_str, entry)

    # Merge individual date keys — do not wipe existing dates
    set_payload = {f"daily_boosts.{d}": v for d, v in incoming.items()}
    set_payload["updated_at"] = datetime.now(timezone.utc)
    await db["dashboard_boosts"].update_one(
        {"project_id": ctx.project_id},
        {"$set": set_payload},
        upsert=True,
    )

    doc = await db["dashboard_boosts"].find_one(
        {"project_id": ctx.project_id}, {"_id": 0, "daily_boosts": 1}
    )
    return {"project_id": ctx.project_id, "daily_boosts": (doc or {}).get("daily_boosts", {})}
