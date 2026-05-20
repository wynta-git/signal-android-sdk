from datetime import datetime, timedelta, timezone

import structlog
from aiokafka import AIOKafkaProducer
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app.audience import is_in_audience
from app.config import settings
from app.models import Audience, Campaign, CampaignRun
from app.prefetch import trigger_segment_refresh
from app.rate_limit import check_rate_limit, mark_sent
from app.sender import emit_send_job
from shared.clients.mongo import (
    get_due_oneoff_campaigns,
    get_running_scheduled_campaigns,
    insert_campaign_run,
    update_campaign,
    update_campaign_run,
)
from shared.clients.redis import stream_segment_members

log = structlog.get_logger()

_scheduler = AsyncIOScheduler()

_ONEOFF_JOB_ID = "__oneoff_poller__"


async def start(
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    campaigns = await get_running_scheduled_campaigns(db)
    for camp_doc in campaigns:
        campaign = Campaign.model_validate(camp_doc)
        _register_job(campaign, db, redis, producer)

    _scheduler.add_job(
        _poll_oneoff_campaigns,
        trigger=IntervalTrigger(seconds=settings.oneoff_poll_interval_seconds),
        id=_ONEOFF_JOB_ID,
        kwargs={"db": db, "redis": redis, "producer": producer},
        replace_existing=True,
    )

    _scheduler.start()
    log.info("scheduler.started", scheduled_jobs=len(campaigns))


def stop() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("scheduler.stopped")


def register_campaign(
    campaign: Campaign,
    db: AsyncIOMotorDatabase,
    redis: Redis | None = None,
    producer: AIOKafkaProducer | None = None,
) -> None:
    _register_job(campaign, db, redis, producer)


def unregister_campaign(project_id: str, campaign_id: str) -> None:
    job_id = _job_id(project_id, campaign_id)
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        log.info("scheduler.job_removed", project_id=project_id, campaign_id=campaign_id)


def register_oneoff_prefetch(campaign: Campaign) -> None:
    segment_id = campaign.audience.segment_id
    if not segment_id:
        return

    send_at = campaign.trigger.send_at
    if not send_at:
        return

    fire_at = send_at - timedelta(minutes=settings.segment_prefetch_lead_minutes)
    now = datetime.now(timezone.utc)

    job_id = _prefetch_job_id(campaign.project_id, campaign.campaign_id)
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)

    if fire_at <= now:
        # Not enough lead time — refresh immediately in the background
        _scheduler.add_job(
            trigger_segment_refresh,
            trigger=DateTrigger(run_date=now),
            id=job_id,
            kwargs={"project_id": campaign.project_id, "segment_id": segment_id},
            replace_existing=True,
        )
        log.info(
            "scheduler.prefetch_immediate",
            project_id=campaign.project_id,
            campaign_id=campaign.campaign_id,
            segment_id=segment_id,
        )
    else:
        _scheduler.add_job(
            trigger_segment_refresh,
            trigger=DateTrigger(run_date=fire_at),
            id=job_id,
            kwargs={"project_id": campaign.project_id, "segment_id": segment_id},
            replace_existing=True,
        )
        log.info(
            "scheduler.prefetch_scheduled",
            project_id=campaign.project_id,
            campaign_id=campaign.campaign_id,
            segment_id=segment_id,
            fire_at=fire_at.isoformat(),
        )


def unregister_oneoff_prefetch(project_id: str, campaign_id: str) -> None:
    job_id = _prefetch_job_id(project_id, campaign_id)
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        log.info("scheduler.prefetch_removed", project_id=project_id, campaign_id=campaign_id)


def _register_job(
    campaign: Campaign,
    db: AsyncIOMotorDatabase,
    redis: Redis | None,
    producer: AIOKafkaProducer | None,
) -> None:
    cron = campaign.trigger.cron
    if not cron:
        log.warning("scheduler.missing_cron", campaign_id=campaign.campaign_id)
        return

    job_id = _job_id(campaign.project_id, campaign.campaign_id)
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)

    _scheduler.add_job(
        _run_scheduled_campaign,
        trigger=CronTrigger.from_crontab(cron),
        id=job_id,
        kwargs={
            "campaign": campaign,
            "db": db,
            "redis": redis,
            "producer": producer,
        },
        replace_existing=True,
    )
    log.info(
        "scheduler.job_registered",
        project_id=campaign.project_id,
        campaign_id=campaign.campaign_id,
        cron=cron,
    )


def _job_id(project_id: str, campaign_id: str) -> str:
    return f"{project_id}:{campaign_id}"


def _prefetch_job_id(project_id: str, campaign_id: str) -> str:
    return f"{project_id}:{campaign_id}:prefetch"


async def _run_scheduled_campaign(
    campaign: Campaign,
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    log.info(
        "scheduler.run_start",
        project_id=campaign.project_id,
        campaign_id=campaign.campaign_id,
    )
    try:
        await _execute_campaign(campaign, db, redis, producer)
    except Exception:
        log.exception(
            "scheduler.run_failed",
            project_id=campaign.project_id,
            campaign_id=campaign.campaign_id,
        )


async def _poll_oneoff_campaigns(
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    now = datetime.now(timezone.utc)
    due = await get_due_oneoff_campaigns(db, now)
    for camp_doc in due:
        try:
            campaign = Campaign.model_validate(camp_doc)
            # Mark running immediately to prevent duplicate fires from concurrent pollers
            ok = await update_campaign(
                db,
                campaign.project_id,
                campaign.campaign_id,
                {"status": "running"},
            )
            if not ok:
                continue
            campaign = Campaign.model_validate({**camp_doc, "status": "running"})
            await _execute_campaign(campaign, db, redis, producer)
            await update_campaign(
                db, campaign.project_id, campaign.campaign_id, {"status": "completed"}
            )
        except Exception:
            log.exception(
                "scheduler.oneoff_failed",
                campaign_id=camp_doc.get("campaign_id"),
            )


async def _execute_campaign(
    campaign: Campaign,
    db: AsyncIOMotorDatabase,
    redis: Redis,
    producer: AIOKafkaProducer,
) -> None:
    now = datetime.now(timezone.utc)
    run = CampaignRun(project_id=campaign.project_id, campaign_id=campaign.campaign_id)
    run_id = await insert_campaign_run(db, run.model_dump(mode="json"))

    sent = 0
    skipped = 0

    async for user_ids in stream_segment_members(redis, campaign.project_id, campaign.audience.segment_id or ""):
        for user_id in user_ids:
            try:
                in_audience = await is_in_audience(
                    campaign.audience, campaign.project_id, user_id, redis
                )
                if not in_audience:
                    skipped += 1
                    continue

                allowed = await check_rate_limit(campaign, user_id, redis)
                if not allowed:
                    skipped += 1
                    continue

                await emit_send_job(
                    producer,
                    campaign=campaign,
                    campaign_run_id=run_id,
                    user_id=user_id,
                    deliver_at=now,
                    context={},
                )
                await mark_sent(campaign, user_id, redis)
                sent += 1
            except Exception:
                log.exception(
                    "scheduler.user_send_failed",
                    project_id=campaign.project_id,
                    campaign_id=campaign.campaign_id,
                    user_id=user_id,
                )

    await update_campaign_run(
        db,
        campaign.project_id,
        run_id,
        {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc),
            "sent_count": sent,
            "skipped_count": skipped,
        },
    )
    log.info(
        "scheduler.run_complete",
        project_id=campaign.project_id,
        campaign_id=campaign.campaign_id,
        sent=sent,
        skipped=skipped,
    )
