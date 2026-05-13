from datetime import datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase


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
