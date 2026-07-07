import asyncio
from datetime import UTC, datetime
from typing import Any

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, IndexModel
from redis.asyncio import Redis
from shared.services.segments import (
    get_membership,
    get_segment_member_ids,
    list_segment_members,
)
from shared.services.segments import segment_joined_key as _joined_key
from shared.services.segments import segment_members_key as _members_key

log = structlog.get_logger()

SEGMENTS_COL = "segments"
DERIVED_RULES_COL = "derived_rules"

__all__ = [
    "get_membership",
    "get_segment_member_ids",
    "list_segment_members",
]


async def create_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db[SEGMENTS_COL].create_indexes([
            IndexModel([("project_id", ASCENDING), ("segment_id", ASCENDING)], unique=True),
        ])
        await db[DERIVED_RULES_COL].create_indexes([
            IndexModel([("project_id", ASCENDING), ("rule_id", ASCENDING)], unique=True),
        ])
        await db["trait_schemas"].create_indexes([
            IndexModel([("project_id", ASCENDING), ("trait", ASCENDING)], unique=True),
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
    db: AsyncIOMotorDatabase, project_id: str, brand_id: str | None = None
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"project_id": project_id}
    if brand_id is not None:
        query["brand_id"] = brand_id
    cursor = db[SEGMENTS_COL].find(query, {"_id": 0})
    segments = await cursor.to_list(length=None)

    if segments:
        segment_ids = [s["segment_id"] for s in segments]
        campaign_cursor = db["campaigns"].find(
            {"project_id": project_id, "audience.segment_id": {"$in": segment_ids}},
            {"_id": 0, "name": 1, "audience.segment_id": 1},
        )
        campaigns = await campaign_cursor.to_list(length=None)
        usage: dict[str, list[str]] = {}
        for c in campaigns:
            seg_id = (c.get("audience") or {}).get("segment_id")
            if seg_id:
                usage.setdefault(seg_id, []).append(c["name"])
        for seg in segments:
            seg["used_by_campaigns"] = usage.get(seg["segment_id"], [])

    segments.sort(key=lambda s: s.get("members_count") or 0, reverse=True)
    return segments


async def get_segment_stats(
    db: AsyncIOMotorDatabase, project_id: str, redis: Redis, brand_id: str | None = None
) -> dict[str, Any]:
    brand_filter: dict[str, Any] = {"brand_id": brand_id} if brand_id is not None else {}
    (
        total_segments,
        active_campaigns_using,
        reachable_count,
        total_users,
        push_agg,
        segment_ids,
    ) = await asyncio.gather(
        db[SEGMENTS_COL].count_documents({"project_id": project_id, **brand_filter}),
        db["campaigns"].count_documents({
            "project_id": project_id,
            "audience.segment_id": {"$exists": True, "$ne": None},
            **brand_filter,
        }),
        db["users"].count_documents({
            "project_id": project_id,
            **brand_filter,
            "$or": [
                {"traits.email_hash": {"$exists": True, "$ne": None}},
                {"traits.phone_hash": {"$exists": True, "$ne": None}},
            ],
        }),
        db["users"].count_documents({"project_id": project_id, **brand_filter}),
        db["device_tokens"].aggregate([
            {"$match": {"project_id": project_id, **brand_filter}},
            {"$group": {"_id": "$user_id"}},
            {"$count": "count"},
        ]).to_list(length=1),
        db[SEGMENTS_COL].distinct("segment_id", {"project_id": project_id, **brand_filter}),
    )
    push_count = push_agg[0]["count"] if push_agg else 0
    estimated_reach = min(reachable_count + push_count, total_users)

    if segment_ids:
        keys = [_members_key(project_id, sid) for sid in segment_ids]
        union = await redis.sunion(*keys)
        segment_unique_reach = len(union)
    else:
        segment_unique_reach = 0

    return {
        "total_segments": total_segments,
        "active_campaigns_using": active_campaigns_using,
        "estimated_reach": estimated_reach,
        "segment_unique_reach": segment_unique_reach,
    }


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
    now = datetime.now(tz=UTC).isoformat()
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
    now = datetime.now(tz=UTC).isoformat()
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


async def append_upload_history(
    db: AsyncIOMotorDatabase,
    project_id: str,
    segment_id: str,
    entry: dict[str, Any],
    updates: dict[str, Any],
) -> bool:
    result = await db[SEGMENTS_COL].update_one(
        {"project_id": project_id, "segment_id": segment_id},
        {"$set": updates, "$push": {"upload_history": entry}},
    )
    return result.matched_count > 0


async def delete_memberships(
    redis: Redis, project_id: str, segment_id: str
) -> None:
    await redis.delete(
        _members_key(project_id, segment_id),
        _joined_key(project_id, segment_id),
    )
    log.info("memberships.cleared", project_id=project_id, segment_id=segment_id)


async def create_derived_rule(db: AsyncIOMotorDatabase, doc: dict[str, Any]) -> None:
    await db[DERIVED_RULES_COL].insert_one(doc)
    log.info("derived_rule.created", project_id=doc["project_id"], rule_id=doc["rule_id"])


async def get_derived_rule(
    db: AsyncIOMotorDatabase, project_id: str, rule_id: str
) -> dict[str, Any] | None:
    return await db[DERIVED_RULES_COL].find_one(
        {"project_id": project_id, "rule_id": rule_id},
        {"_id": 0},
    )


async def list_derived_rules(
    db: AsyncIOMotorDatabase, project_id: str
) -> list[dict[str, Any]]:
    cursor = db[DERIVED_RULES_COL].find({"project_id": project_id}, {"_id": 0})
    return await cursor.to_list(length=None)


async def update_derived_rule(
    db: AsyncIOMotorDatabase,
    project_id: str,
    rule_id: str,
    updates: dict[str, Any],
) -> bool:
    result = await db[DERIVED_RULES_COL].update_one(
        {"project_id": project_id, "rule_id": rule_id},
        {"$set": updates},
    )
    return result.matched_count > 0


async def delete_derived_rule(
    db: AsyncIOMotorDatabase, project_id: str, rule_id: str
) -> bool:
    result = await db[DERIVED_RULES_COL].delete_one(
        {"project_id": project_id, "rule_id": rule_id}
    )
    if result.deleted_count:
        log.info("derived_rule.deleted", project_id=project_id, rule_id=rule_id)
    return result.deleted_count > 0


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
