from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel
from redis.asyncio import Redis
from shared.clients.mongo import get_user, get_users_batch
from shared.services.segments import get_user_segment_memberships, list_segment_members
from shared.services.user import resolve_pam_id_from_brand


def _brand_id_str(value: Any) -> str | None:
    """Mongo stores brand_id inconsistently (str in most docs, int in some
    older/legacy ones) — normalize to str at the read boundary so callers and
    response models don't need to care."""
    return None if value is None else str(value)


class SegmentInfo(BaseModel):
    segment_id: str
    name: str | None = None


class PamUser(BaseModel):
    user_id: str
    pam_id: int | None
    brand_id: str | None
    joined_at: str | None
    traits: dict[str, Any]
    first_seen_at: Any = None
    last_seen_at: Any = None


class SegmentUserPage(BaseModel):
    segment_id: str
    users: list[PamUser]
    has_more: bool
    next_cursor: str | None


class PamUserProfile(BaseModel):
    user_id: str
    pam_id: int | None
    brand_id: str | None
    traits: dict[str, Any]
    first_seen_at: Any = None
    last_seen_at: Any = None
    health_status: str | None = None
    segments: list[SegmentInfo]


async def get_pam_users_for_segment(
    mongo_db: AsyncIOMotorDatabase,
    redis: Redis,
    project_id: str,
    segment_id: str,
    limit: int,
    cursor: str | None,
) -> SegmentUserPage:
    rows = await list_segment_members(redis, project_id, segment_id, limit + 1, cursor)
    has_more = len(rows) > limit
    rows = rows[:limit]

    user_ids = [r["user_id"] for r in rows]
    profiles = await get_users_batch(mongo_db, project_id, user_ids)

    users: list[PamUser] = []
    for row in rows:
        doc = profiles.get(row["user_id"], {})
        brand_id = _brand_id_str(doc.get("brand_id"))
        pam_id = await resolve_pam_id_from_brand(redis, brand_id, row["user_id"])
        users.append(
            PamUser(
                user_id=row["user_id"],
                pam_id=pam_id,
                brand_id=brand_id,
                joined_at=row.get("joined_at"),
                traits=doc.get("traits") or {},
                first_seen_at=doc.get("first_seen_at"),
                last_seen_at=doc.get("last_seen_at"),
            )
        )

    return SegmentUserPage(
        segment_id=segment_id,
        users=users,
        has_more=has_more,
        next_cursor=users[-1].user_id if has_more and users else None,
    )


async def get_pam_user_profile(
    mongo_db: AsyncIOMotorDatabase,
    redis: Redis,
    project_id: str,
    user_id: str,
    brand_id: str,
) -> PamUserProfile | None:
    doc = await get_user(mongo_db, project_id, user_id, brand_id)
    if doc is None:
        return None

    brand_id = _brand_id_str(doc.get("brand_id"))
    pam_id = await resolve_pam_id_from_brand(redis, brand_id, user_id)
    segments = await get_user_segment_memberships(redis, mongo_db, project_id, user_id)

    return PamUserProfile(
        user_id=user_id,
        pam_id=pam_id,
        brand_id=brand_id,
        traits=doc.get("traits") or {},
        first_seen_at=doc.get("first_seen_at"),
        last_seen_at=doc.get("last_seen_at"),
        health_status=doc.get("health_status"),
        segments=[SegmentInfo(**s) for s in segments],
    )
