from datetime import datetime, timezone
from typing import Any

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, IndexModel

log = structlog.get_logger()

SEGMENTS_COL = "segments"
MEMBERSHIPS_COL = "segment_memberships"


async def create_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db[SEGMENTS_COL].create_indexes([
            IndexModel([("project_id", ASCENDING), ("segment_id", ASCENDING)], unique=True),
        ])
        await db[MEMBERSHIPS_COL].create_indexes([
            IndexModel(
                [("project_id", ASCENDING), ("segment_id", ASCENDING), ("user_id", ASCENDING)],
                unique=True,
            ),
            IndexModel([("project_id", ASCENDING), ("user_id", ASCENDING)]),
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
        await delete_memberships(db, project_id, segment_id)
        log.info("segment.deleted", project_id=project_id, segment_id=segment_id)
    return result.deleted_count > 0


async def update_segment_size(
    db: AsyncIOMotorDatabase,
    project_id: str,
    segment_id: str,
    size: int,
    computed_at: datetime,
) -> None:
    await db[SEGMENTS_COL].update_one(
        {"project_id": project_id, "segment_id": segment_id},
        {"$set": {"size": size, "computed_at": computed_at}},
    )


async def upsert_membership(
    db: AsyncIOMotorDatabase, project_id: str, segment_id: str, user_id: str
) -> None:
    await db[MEMBERSHIPS_COL].update_one(
        {"project_id": project_id, "segment_id": segment_id, "user_id": user_id},
        {"$setOnInsert": {"joined_at": datetime.now(tz=timezone.utc)}},
        upsert=True,
    )


async def bulk_upsert_memberships(
    db: AsyncIOMotorDatabase,
    project_id: str,
    segment_id: str,
    user_ids: set[str],
) -> None:
    if not user_ids:
        return
    from pymongo import UpdateOne

    now = datetime.now(tz=timezone.utc)
    ops = [
        UpdateOne(
            {"project_id": project_id, "segment_id": segment_id, "user_id": uid},
            {"$setOnInsert": {"joined_at": now}},
            upsert=True,
        )
        for uid in user_ids
    ]
    await db[MEMBERSHIPS_COL].bulk_write(ops, ordered=False)
    log.info(
        "memberships.upserted",
        project_id=project_id,
        segment_id=segment_id,
        count=len(user_ids),
    )


async def remove_membership(
    db: AsyncIOMotorDatabase, project_id: str, segment_id: str, user_id: str
) -> None:
    await db[MEMBERSHIPS_COL].delete_one(
        {"project_id": project_id, "segment_id": segment_id, "user_id": user_id}
    )


async def delete_memberships(
    db: AsyncIOMotorDatabase, project_id: str, segment_id: str
) -> None:
    result = await db[MEMBERSHIPS_COL].delete_many(
        {"project_id": project_id, "segment_id": segment_id}
    )
    log.info(
        "memberships.cleared",
        project_id=project_id,
        segment_id=segment_id,
        deleted=result.deleted_count,
    )


async def get_user_segment_ids(
    db: AsyncIOMotorDatabase, project_id: str, user_id: str
) -> list[str]:
    cursor = db[MEMBERSHIPS_COL].find(
        {"project_id": project_id, "user_id": user_id},
        {"_id": 0, "segment_id": 1},
    )
    docs = await cursor.to_list(length=None)
    return [d["segment_id"] for d in docs]


async def get_segment_member_ids(
    db: AsyncIOMotorDatabase, project_id: str, segment_id: str
) -> set[str]:
    cursor = db[MEMBERSHIPS_COL].find(
        {"project_id": project_id, "segment_id": segment_id},
        {"_id": 0, "user_id": 1},
    )
    docs = await cursor.to_list(length=None)
    return {d["user_id"] for d in docs}


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
