"""Shared segment-membership reads.

Segment membership is written exclusively by segmentation-engine (Redis Set +
Hash per segment — see services/segmentation-engine/app/storage.py for the
write path), but other services (e.g. auth-service, for the segment-user
list/profile API) need to read the same structures. The key format and
read-only accessors live here so there is exactly one source of truth for
both sides.
"""
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

SEGMENTS_COL = "segments"


def segment_members_key(project_id: str, segment_id: str) -> str:
    return f"pam:seg:{project_id}:{segment_id}:members"


def segment_joined_key(project_id: str, segment_id: str) -> str:
    return f"pam:seg:{project_id}:{segment_id}:joined"


async def list_segment_members(
    redis: Redis,
    project_id: str,
    segment_id: str,
    limit: int,
    cursor: str | None,
) -> list[dict[str, Any]]:
    all_ids = sorted(await redis.smembers(segment_members_key(project_id, segment_id)))
    if cursor:
        all_ids = [uid for uid in all_ids if uid > cursor]
    page_ids = all_ids[:limit]
    if not page_ids:
        return []
    joined_values = await redis.hmget(segment_joined_key(project_id, segment_id), *page_ids)
    return [{"user_id": uid, "joined_at": ts} for uid, ts in zip(page_ids, joined_values)]


async def get_membership(
    redis: Redis,
    project_id: str,
    segment_id: str,
    user_id: str,
) -> dict[str, Any] | None:
    async with redis.pipeline(transaction=False) as pipe:
        pipe.sismember(segment_members_key(project_id, segment_id), user_id)
        pipe.hget(segment_joined_key(project_id, segment_id), user_id)
        is_member, joined_at = await pipe.execute()
    if not is_member:
        return None
    return {"segment_id": segment_id, "user_id": user_id, "joined_at": joined_at}


async def get_segment_member_ids(
    redis: Redis, project_id: str, segment_id: str
) -> set[str]:
    return await redis.smembers(segment_members_key(project_id, segment_id))


async def list_segment_summaries(
    db: AsyncIOMotorDatabase, project_id: str
) -> list[dict[str, Any]]:
    """Lightweight {segment_id, name} list — no campaign-usage join, just
    enough to render segment-membership chips on a user profile."""
    cursor = db[SEGMENTS_COL].find(
        {"project_id": project_id},
        {"_id": 0, "segment_id": 1, "name": 1},
    )
    return await cursor.to_list(length=None)


async def get_user_segment_memberships(
    redis: Redis,
    db: AsyncIOMotorDatabase,
    project_id: str,
    user_id: str,
) -> list[dict[str, Any]]:
    """Return [{segment_id, name}, ...] for every segment in the project that
    user_id currently belongs to."""
    segments = await list_segment_summaries(db, project_id)
    if not segments:
        return []

    async with redis.pipeline(transaction=False) as pipe:
        for seg in segments:
            pipe.sismember(segment_members_key(project_id, seg["segment_id"]), user_id)
        results = await pipe.execute()

    return [seg for seg, is_member in zip(segments, results) if is_member]
