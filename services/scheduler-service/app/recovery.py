import asyncio
from datetime import datetime, timedelta, timezone

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from shared.clients.mongo import (
    get_campaign_run_by_run_id,
    get_stale_locked_campaigns,
    reset_stale_lock,
)

log = structlog.get_logger()


async def recover_stale_locks(db: AsyncIOMotorDatabase) -> None:
    stale_before = datetime.now(timezone.utc) - timedelta(
        seconds=settings.stale_lock_timeout_seconds
    )
    stale = await get_stale_locked_campaigns(db, stale_before)
    for doc in stale:
        campaign_id = doc["campaign_id"]
        project_id = doc["project_id"]
        picked_at = doc.get("picked_at")

        # Only reset if no completed run exists for this campaign recently.
        # We check campaign_runs for a running/completed run created after picked_at.
        # If a run exists and is completed, the poller published and executor ran — no stale lock.
        run = await get_campaign_run_by_run_id(db, campaign_id)
        if run and run.get("status") == "completed":
            continue

        reset = await reset_stale_lock(db, project_id, campaign_id, stale_before)
        if reset:
            log.warning(
                "recovery.stale_lock_reset",
                campaign_id=campaign_id,
                project_id=project_id,
                picked_at=picked_at.isoformat() if picked_at else None,
            )


async def recovery_loop(db: AsyncIOMotorDatabase, stop_event: asyncio.Event) -> None:
    log.info("recovery.started", timeout_seconds=settings.stale_lock_timeout_seconds)
    while not stop_event.is_set():
        try:
            await recover_stale_locks(db)
        except Exception:
            log.exception("recovery.error")
        await asyncio.sleep(60)
    log.info("recovery.stopped")
