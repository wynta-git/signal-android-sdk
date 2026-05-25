"""Segment pre-warm: trigger evaluate on segments needed by upcoming campaigns."""
import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from shared.clients.mongo import get_upcoming_campaigns_with_segments

log = structlog.get_logger()


async def _trigger_segment_refresh(project_id: str, segment_id: str) -> None:
    url = (
        f"{settings.segmentation_engine_url}"
        f"/v1/admin/projects/{project_id}/segments/{segment_id}/evaluate"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url)
            resp.raise_for_status()
        log.info("prefetch.queued", project_id=project_id, segment_id=segment_id)
    except Exception:
        log.warning("prefetch.failed", project_id=project_id, segment_id=segment_id)


async def prefetch_once(db: AsyncIOMotorDatabase) -> None:
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(minutes=settings.segment_prefetch_lead_minutes)
    campaigns = await get_upcoming_campaigns_with_segments(db, now, horizon)

    seen: set[tuple[str, str]] = set()
    for campaign in campaigns:
        project_id = campaign["project_id"]
        segment_id = (campaign.get("audience") or {}).get("segment_id", "")
        if not segment_id:
            continue
        key = (project_id, segment_id)
        if key in seen:
            continue
        seen.add(key)
        await _trigger_segment_refresh(project_id, segment_id)


async def prefetch_loop(
    db: AsyncIOMotorDatabase,
    stop_event: asyncio.Event,
) -> None:
    log.info(
        "prefetch.started",
        lead_minutes=settings.segment_prefetch_lead_minutes,
        interval_seconds=settings.segment_prefetch_interval_seconds,
    )
    while not stop_event.is_set():
        try:
            await prefetch_once(db)
        except Exception:
            log.exception("prefetch.error")
        await asyncio.sleep(settings.segment_prefetch_interval_seconds)
    log.info("prefetch.stopped")
