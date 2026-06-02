import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from clickhouse_connect.driver.asyncclient import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app import storage
from app.dsl.validator import SegmentRule
from app.refresh.engine import evaluate_segment

log = structlog.get_logger()

_scheduler = AsyncIOScheduler()


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler


async def start(db: AsyncIOMotorDatabase, ch: AsyncClient, redis: Redis) -> None:
    segments = await storage.list_scheduled_segments(db)
    for seg in segments:
        _register_job(seg, db, ch, redis)
    _scheduler.start()
    log.info("scheduler.started", job_count=len(segments))


def stop() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("scheduler.stopped")


def register_segment(
    seg: dict,
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    redis: Redis,
) -> None:
    _register_job(seg, db, ch, redis)


def unregister_segment(project_id: str, segment_id: str) -> None:
    job_id = _job_id(project_id, segment_id)
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        log.info("scheduler.job_removed", project_id=project_id, segment_id=segment_id)


def _register_job(
    seg: dict,
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    redis: Redis,
) -> None:
    project_id = seg["project_id"]
    segment_id = seg["segment_id"]
    cron = seg.get("scheduled_cron") or "0 */6 * * *"
    rule = SegmentRule.model_validate(seg["rule"])
    job_id = _job_id(project_id, segment_id)

    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)

    try:
        trigger = CronTrigger.from_crontab(cron)
    except (ValueError, TypeError):
        log.warning(
            "scheduler.invalid_cron_skipped",
            project_id=project_id,
            segment_id=segment_id,
            cron=cron,
        )
        return

    _scheduler.add_job(
        _run_evaluation,
        trigger=trigger,
        id=job_id,
        kwargs={"project_id": project_id, "segment_id": segment_id, "rule": rule, "db": db, "ch": ch, "redis": redis},
        replace_existing=True,
    )
    log.info(
        "scheduler.job_registered",
        project_id=project_id,
        segment_id=segment_id,
        cron=cron,
    )


async def _run_evaluation(
    project_id: str,
    segment_id: str,
    rule: SegmentRule,
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    redis: Redis,
) -> None:
    log.info("scheduler.run_start", project_id=project_id, segment_id=segment_id)
    try:
        await evaluate_segment(project_id, segment_id, rule, db, ch, redis)
    except Exception:
        log.exception("scheduler.run_failed", project_id=project_id, segment_id=segment_id)


def _job_id(project_id: str, segment_id: str) -> str:
    return f"{project_id}:{segment_id}"
