from datetime import datetime, timezone
from typing import Any

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, IndexModel
from redis.asyncio import Redis

log = structlog.get_logger()

SEGMENTS_COL = "segments"


def _members_key(project_id: str, segment_id: str) -> str:
    return f"pam:seg:{project_id}:{segment_id}:members"


def _joined_key(project_id: str, segment_id: str) -> str:
    return f"pam:seg:{project_id}:{segment_id}:joined"


async def create_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db[SEGMENTS_COL].create_indexes([
            IndexModel([("project_id", ASCENDING), ("segment_id", ASCENDING)], unique=True),
        ])
        log.info("mongodb_indexes.ensured")
    except Exception as exc:
        log.error("mongodb_indexes.failed", error=str(exc))


async def create_segment(db: AsyncIOMotorDatabase, doc: dict[str, Any]) -> None:
    await db[SEGMENTS_COL].insert_one(doc)
    log.info("segment.created", project_id=doc["project_id"], segment_id=doc["segment_id"])


async def get_segment(
    db: AsyncIOMotorDatabase, project_id: str, segment_id: str
) -> dict[str, Any] | None:
    return await db[SEGMENTS_COL].find_one(
        {"project_id": project_id, "segment_id": segment_id},
        {"_id": 0},
    )


async def list_segments(
    db: AsyncIOMotorDatabase, project_id: str
) -> list[dict[str, Any]]:
    cursor = db[SEGMENTS_COL].find({"project_id": project_id}, {"_id": 0})
    return await cursor.to_list(length=None)


async def update_segment(
    db: AsyncIOMotorDatabase,
    project_id: str,
    segment_id: str,
    updates: dict[str, Any],
) -> bool:
    result = await db[SEGMENTS_COL].update_one(
        {"project_id": project_id, "segment_id": segment_id},
        {"$set": updates},
    )
    return result.matched_count > 0


async def delete_segment(
    db: AsyncIOMotorDatabase, project_id: str, segment_id: str
) -> bool:
    result = await db[SEGMENTS_COL].delete_one(
        {"project_id": project_id, "segment_id": segment_id}
    )
    if result.deleted_count:
        log.info("segment.deleted", project_id=project_id, segment_id=segment_id)
    return result.deleted_count > 0


async def update_segment_size(
    db: AsyncIOMotorDatabase,
    project_id: str,
    segment_id: str,
    members_count: int,
    last_refresh_time: datetime,
) -> None:
    await db[SEGMENTS_COL].update_one(
        {"project_id": project_id, "segment_id": segment_id},
        {"$set": {"members_count": members_count, "last_refresh_time": last_refresh_time}},
    )


async def upsert_membership(
    redis: Redis, project_id: str, segment_id: str, user_id: str
) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    async with redis.pipeline(transaction=False) as pipe:
        pipe.sadd(_members_key(project_id, segment_id), user_id)
        pipe.hsetnx(_joined_key(project_id, segment_id), user_id, now)
        await pipe.execute()


async def bulk_upsert_memberships(
    redis: Redis,
    project_id: str,
    segment_id: str,
    user_ids: set[str],
) -> None:
    if not user_ids:
        return
    now = datetime.now(tz=timezone.utc).isoformat()
    async with redis.pipeline(transaction=False) as pipe:
        pipe.sadd(_members_key(project_id, segment_id), *user_ids)
        for uid in user_ids:
            pipe.hsetnx(_joined_key(project_id, segment_id), uid, now)
        await pipe.execute()
    log.info(
        "memberships.upserted",
        project_id=project_id,
        segment_id=segment_id,
        count=len(user_ids),
    )


async def remove_membership(
    redis: Redis, project_id: str, segment_id: str, user_id: str
) -> None:
    async with redis.pipeline(transaction=False) as pipe:
        pipe.srem(_members_key(project_id, segment_id), user_id)
        pipe.hdel(_joined_key(project_id, segment_id), user_id)
        await pipe.execute()


async def delete_memberships(
    redis: Redis, project_id: str, segment_id: str
) -> None:
    await redis.delete(
        _members_key(project_id, segment_id),
        _joined_key(project_id, segment_id),
    )
    log.info("memberships.cleared", project_id=project_id, segment_id=segment_id)


async def list_segment_members(
    redis: Redis,
    project_id: str,
    segment_id: str,
    limit: int,
    cursor: str | None,
) -> list[dict[str, Any]]:
    all_ids = sorted(await redis.smembers(_members_key(project_id, segment_id)))
    if cursor:
        all_ids = [uid for uid in all_ids if uid > cursor]
    page_ids = all_ids[:limit]
    if not page_ids:
        return []
    joined_values = await redis.hmget(_joined_key(project_id, segment_id), *page_ids)
    return [{"user_id": uid, "joined_at": ts} for uid, ts in zip(page_ids, joined_values)]


async def get_membership(
    redis: Redis,
    project_id: str,
    segment_id: str,
    user_id: str,
) -> dict[str, Any] | None:
    async with redis.pipeline(transaction=False) as pipe:
        pipe.sismember(_members_key(project_id, segment_id), user_id)
        pipe.hget(_joined_key(project_id, segment_id), user_id)
        is_member, joined_at = await pipe.execute()
    if not is_member:
        return None
    return {"segment_id": segment_id, "user_id": user_id, "joined_at": joined_at}


async def get_segment_member_ids(
    redis: Redis, project_id: str, segment_id: str
) -> set[str]:
    return await redis.smembers(_members_key(project_id, segment_id))


async def list_scheduled_segments(
    db: AsyncIOMotorDatabase,
) -> list[dict[str, Any]]:
    cursor = db[SEGMENTS_COL].find(
        {"refresh_strategy": "scheduled"},
        {"_id": 0},
    )
    return await cursor.to_list(length=None)


async def list_on_event_segments(
    db: AsyncIOMotorDatabase, project_id: str, event_name: str
) -> list[dict[str, Any]]:
    """Return on_event segments for a project whose rule references event_name."""
    cursor = db[SEGMENTS_COL].find(
        {
            "project_id": project_id,
            "refresh_strategy": "on_event",
            "rule.filters": {
                "$elemMatch": {
                    "type": {"$in": ["event", "did_not_do"]},
                    "event_name": event_name,
                }
            },
        },
        {"_id": 0},
    )
    return await cursor.to_list(length=None)
