from datetime import datetime, timezone
from typing import Any

import structlog
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

log = structlog.get_logger()


def make_mongo_client(
    url: str,
    *,
    min_pool_size: int = 5,
    max_pool_size: int = 50,
) -> AsyncIOMotorClient:
    return AsyncIOMotorClient(
        url,
        minPoolSize=min_pool_size,
        maxPoolSize=max_pool_size,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=10000,
    )


async def find_active_token(
    db: AsyncIOMotorDatabase,
    token_hash: str,
) -> dict[str, Any] | None:
    return await db["tokens"].find_one(
        {"token_hash": token_hash, "status": "active"},
        {"project_id": 1, "scope": 1, "_id": 0},
    )


async def touch_token_last_used(
    db: AsyncIOMotorDatabase,
    token_hash: str,
) -> None:
    """Best-effort audit write. Failure is logged but never propagated."""
    try:
        await db["tokens"].update_one(
            {"token_hash": token_hash},
            {"$set": {"last_used_at": datetime.now(timezone.utc)}},
        )
    except Exception:
        log.warning("last_used_update_failed", token_hash_prefix=token_hash[:8])


async def load_event_routes(db: AsyncIOMotorDatabase) -> list[dict]:
    """Load all topic→event_names mappings from event_routes collection."""
    cursor = db["event_routes"].find({}, {"topic": 1, "event_names": 1, "_id": 0})
    return await cursor.to_list(length=None)


async def upsert_user_profile(
    db: AsyncIOMotorDatabase,
    *,
    project_id: str,
    user_id: str,
    traits: dict[str, Any],
    anonymous_id: str | None,
    unset_traits: list[str],
    now: datetime,
) -> None:
    set_fields: dict[str, Any] = {f"traits.{k}": v for k, v in traits.items()}
    set_fields["last_seen_at"] = now

    update: dict[str, Any] = {
        "$set": set_fields,
        "$setOnInsert": {"first_seen_at": now},
    }
    if anonymous_id:
        update["$addToSet"] = {"anonymous_ids": anonymous_id}
    if unset_traits:
        update["$unset"] = {f"traits.{k}": "" for k in unset_traits}

    await db["users"].update_one(
        {"project_id": project_id, "user_id": user_id},
        update,
        upsert=True,
    )
