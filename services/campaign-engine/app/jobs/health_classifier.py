"""
Nightly batch job that computes health_status for every user and writes it
to the users collection in MongoDB.

Classification rules (evaluated in priority order):
  vip         — vip_level in {gold, platinum}
  new         — registered within the last 7 days
  reactivated — was churned, now has activity within last 7 days
  healthy     — last activity < 7 days ago
  at_risk     — last activity 8–29 days ago
  churned     — last activity 30+ days ago, or no activity recorded

Scheduled: nightly at 02:00 UTC.
Also runs once at startup (after a 10-second grace period) so reports
are populated immediately on first deploy.
"""

import asyncio
import re
from datetime import datetime, timezone
from typing import Any

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from pymongo import UpdateOne

log = structlog.get_logger()

_VIP_LEVELS         = frozenset({"gold", "platinum"})
_HEALTHY_DAYS       = 7
_AT_RISK_DAYS       = 30

_scheduler: AsyncIOScheduler | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ch_table(project_id: str) -> str:
    safe = re.sub(r"[^a-z0-9_]", "_", project_id.lower()).strip("_") or "unknown"
    return f"pam.events_{safe}"


def _classify(
    created_at: datetime | None,
    current_status: str | None,
    vip_level: str | None,
    last_active: datetime | None,
    now: datetime,
) -> str:
    if vip_level and vip_level.lower() in _VIP_LEVELS:
        return "vip"

    if created_at:
        ca = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
        if (now - ca).days < _HEALTHY_DAYS:
            return "new"

    if last_active is None:
        return "churned"

    days_inactive = (now - last_active).days

    if days_inactive < _HEALTHY_DAYS:
        return "reactivated" if current_status == "churned" else "healthy"
    if days_inactive < _AT_RISK_DAYS:
        return "at_risk"
    return "churned"


# ── Per-project classification ────────────────────────────────────────────────

async def _classify_project(db: Any, ch: Any, project_id: str, now: datetime) -> int:
    # 1. Last activity per user from ClickHouse
    tbl = _ch_table(project_id)
    last_active_map: dict[str, datetime] = {}
    try:
        result = await ch.query(
            f"SELECT user_id, max(timestamp) AS last_active FROM {tbl} GROUP BY user_id"
        )
        for row in result.named_results():
            ts = row.get("last_active")
            if ts:
                if not isinstance(ts, datetime):
                    ts = datetime.fromisoformat(str(ts))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                last_active_map[row["user_id"]] = ts
    except Exception:
        log.warning("health_classifier.ch_query_failed", project_id=project_id)

    # 2. All users for this project from MongoDB
    users = await db["users"].find(
        {"project_id": project_id},
        {"_id": 0, "user_id": 1, "created_at": 1, "health_status": 1, "vip_level": 1},
    ).to_list(length=None)

    if not users:
        return 0

    # 3. Classify and bulk-write only changed users
    ops: list[UpdateOne] = []
    for user in users:
        new_status = _classify(
            created_at=user.get("created_at"),
            current_status=user.get("health_status"),
            vip_level=user.get("vip_level"),
            last_active=last_active_map.get(user["user_id"]),
            now=now,
        )
        if new_status != user.get("health_status"):
            ops.append(UpdateOne(
                {"project_id": project_id, "user_id": user["user_id"]},
                {"$set": {"health_status": new_status, "health_classified_at": now}},
            ))

    if ops:
        await db["users"].bulk_write(ops, ordered=False)

    log.info(
        "health_classifier.project_done",
        project_id=project_id,
        total_users=len(users),
        updated=len(ops),
    )
    return len(ops)


# ── Entry point ───────────────────────────────────────────────────────────────

async def run(db: Any, ch: Any) -> None:
    now = datetime.now(timezone.utc)
    log.info("health_classifier.run_start")

    project_ids: list[str] = await db["users"].distinct("project_id")
    if not project_ids:
        log.info("health_classifier.no_users")
        return

    total_updated = 0
    for pid in project_ids:
        try:
            total_updated += await _classify_project(db, ch, pid, now)
        except Exception:
            log.exception("health_classifier.project_failed", project_id=pid)

    log.info(
        "health_classifier.run_done",
        updated=total_updated,
        projects=len(project_ids),
    )


async def _startup_run(db: Any, ch: Any) -> None:
    await asyncio.sleep(10)  # wait for connections to settle
    await run(db, ch)


# ── Scheduler lifecycle ───────────────────────────────────────────────────────

def start(db: Any, ch: Any) -> None:
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        run,
        args=[db, ch],
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="health_classifier_nightly",
        replace_existing=True,
    )
    _scheduler.start()
    log.info("health_classifier.scheduler_started", schedule="daily at 02:00 UTC")

    # Run once at startup so data is available immediately
    asyncio.ensure_future(_startup_run(db, ch))


def stop() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
