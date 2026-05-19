from collections.abc import AsyncGenerator
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


async def upsert_col_map(
    db: AsyncIOMotorDatabase,
    project_id: str,
    new_entries: dict[str, str],
) -> None:
    """Persist new raw_key → col_name pairs for a project. Safe to call concurrently."""
    if not new_entries:
        return
    await db["col_maps"].update_one(
        {"project_id": project_id},
        {
            "$set": {f"col_map.{k}": v for k, v in new_entries.items()},
            "$setOnInsert": {"project_id": project_id},
            "$currentDate": {"updated_at": True},
        },
        upsert=True,
    )


async def load_col_map(
    db: AsyncIOMotorDatabase,
    project_id: str,
) -> dict[str, str]:
    """Return the full raw_key → col_name map for a project, or {} if not found."""
    doc = await db["col_maps"].find_one(
        {"project_id": project_id},
        {"col_map": 1, "_id": 0},
    )
    if not doc:
        return {}
    return doc.get("col_map") or {}


# ---------------------------------------------------------------------------
# Campaign helpers
# ---------------------------------------------------------------------------


async def create_campaign_indexes(db: AsyncIOMotorDatabase) -> None:
    await db["campaigns"].create_index(
        [("project_id", 1), ("campaign_id", 1)], unique=True
    )
    await db["campaigns"].create_index([("project_id", 1), ("status", 1)])
    await db["campaigns"].create_index(
        [("project_id", 1), ("trigger.type", 1), ("trigger.event_name", 1), ("status", 1)]
    )
    await db["campaigns"].create_index(
        [("status", 1), ("trigger.type", 1), ("trigger.send_at", 1)]
    )
    await db["campaign_runs"].create_index(
        [("project_id", 1), ("campaign_id", 1), ("status", 1)]
    )
    await db["campaign_runs"].create_index([("project_id", 1), ("run_id", 1)], unique=True)
    await db["notification_templates"].create_index(
        [("project_id", 1), ("template_id", 1)], unique=True
    )


async def insert_campaign(db: AsyncIOMotorDatabase, doc: dict[str, Any]) -> str:
    await db["campaigns"].insert_one(doc)
    return doc["campaign_id"]


async def get_campaign(
    db: AsyncIOMotorDatabase, project_id: str, campaign_id: str
) -> dict[str, Any] | None:
    return await db["campaigns"].find_one(
        {"project_id": project_id, "campaign_id": campaign_id},
        {"_id": 0},
    )


async def list_campaigns(
    db: AsyncIOMotorDatabase,
    project_id: str,
    status: str | None = None,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"project_id": project_id}
    if status:
        query["status"] = status
    cursor = db["campaigns"].find(query, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=None)


async def update_campaign(
    db: AsyncIOMotorDatabase,
    project_id: str,
    campaign_id: str,
    updates: dict[str, Any],
) -> bool:
    result = await db["campaigns"].update_one(
        {"project_id": project_id, "campaign_id": campaign_id},
        {"$set": {**updates, "updated_at": datetime.now(timezone.utc)}},
    )
    return result.matched_count > 0


async def delete_campaign(
    db: AsyncIOMotorDatabase, project_id: str, campaign_id: str
) -> bool:
    result = await db["campaigns"].delete_one(
        {"project_id": project_id, "campaign_id": campaign_id}
    )
    return result.deleted_count > 0


async def get_running_campaigns_for_event(
    db: AsyncIOMotorDatabase, project_id: str, event_name: str
) -> list[dict[str, Any]]:
    cursor = db["campaigns"].find(
        {
            "project_id": project_id,
            "status": "running",
            "trigger.type": "event",
            "trigger.event_name": event_name,
        },
        {"_id": 0},
    )
    return await cursor.to_list(length=None)


async def get_running_scheduled_campaigns(
    db: AsyncIOMotorDatabase,
) -> list[dict[str, Any]]:
    cursor = db["campaigns"].find(
        {"status": "running", "trigger.type": "scheduled"},
        {"_id": 0},
    )
    return await cursor.to_list(length=None)


async def get_due_oneoff_campaigns(
    db: AsyncIOMotorDatabase, now: datetime
) -> list[dict[str, Any]]:
    cursor = db["campaigns"].find(
        {
            "status": "scheduled",
            "trigger.type": "one_off",
            "trigger.send_at": {"$lte": now},
        },
        {"_id": 0},
    )
    return await cursor.to_list(length=None)


async def insert_campaign_run(db: AsyncIOMotorDatabase, doc: dict[str, Any]) -> str:
    await db["campaign_runs"].insert_one(doc)
    return doc["run_id"]


async def get_active_campaign_run(
    db: AsyncIOMotorDatabase, project_id: str, campaign_id: str
) -> dict[str, Any] | None:
    return await db["campaign_runs"].find_one(
        {"project_id": project_id, "campaign_id": campaign_id, "status": "running"},
        {"_id": 0},
    )


async def update_campaign_run(
    db: AsyncIOMotorDatabase, project_id: str, run_id: str, updates: dict[str, Any]
) -> bool:
    result = await db["campaign_runs"].update_one(
        {"project_id": project_id, "run_id": run_id},
        {"$set": updates},
    )
    return result.matched_count > 0


async def increment_campaign_run_sent(
    db: AsyncIOMotorDatabase, project_id: str, run_id: str
) -> None:
    await db["campaign_runs"].update_one(
        {"project_id": project_id, "run_id": run_id},
        {"$inc": {"sent_count": 1}},
    )


# ---------------------------------------------------------------------------
# Notification template helpers
# ---------------------------------------------------------------------------


async def insert_template(db: AsyncIOMotorDatabase, doc: dict[str, Any]) -> str:
    await db["notification_templates"].insert_one(doc)
    return doc["template_id"]


async def get_template(
    db: AsyncIOMotorDatabase, project_id: str, template_id: str
) -> dict[str, Any] | None:
    return await db["notification_templates"].find_one(
        {"project_id": project_id, "template_id": template_id},
        {"_id": 0},
    )


async def list_templates(
    db: AsyncIOMotorDatabase, project_id: str
) -> list[dict[str, Any]]:
    cursor = db["notification_templates"].find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", -1)
    return await cursor.to_list(length=None)


async def update_template(
    db: AsyncIOMotorDatabase,
    project_id: str,
    template_id: str,
    updates: dict[str, Any],
) -> bool:
    result = await db["notification_templates"].update_one(
        {"project_id": project_id, "template_id": template_id},
        {"$set": {**updates, "updated_at": datetime.now(timezone.utc)}},
    )
    return result.matched_count > 0


async def delete_template(
    db: AsyncIOMotorDatabase, project_id: str, template_id: str
) -> bool:
    result = await db["notification_templates"].delete_one(
        {"project_id": project_id, "template_id": template_id}
    )
    return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Segment membership reads (campaign-engine reads only, never writes)
# ---------------------------------------------------------------------------


async def is_segment_member(
    db: AsyncIOMotorDatabase, project_id: str, segment_id: str, user_id: str
) -> bool:
    doc = await db["segment_memberships"].find_one(
        {"project_id": project_id, "segment_id": segment_id, "user_id": user_id},
        {"_id": 1},
    )
    return doc is not None


async def stream_segment_members(
    db: AsyncIOMotorDatabase,
    project_id: str,
    segment_id: str,
    batch_size: int = 500,
) -> AsyncGenerator[list[str], None]:
    cursor = db["segment_memberships"].find(
        {"project_id": project_id, "segment_id": segment_id},
        {"user_id": 1, "_id": 0},
    ).batch_size(batch_size)

    batch: list[str] = []
    async for doc in cursor:
        batch.append(doc["user_id"])
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


# ---------------------------------------------------------------------------
# Admin helpers — tokens
# ---------------------------------------------------------------------------


async def admin_create_token(db: AsyncIOMotorDatabase, doc: dict[str, Any]) -> str:
    result = await db["tokens"].insert_one(doc)
    return str(result.inserted_id)


async def admin_list_tokens(
    db: AsyncIOMotorDatabase, project_id: str
) -> list[dict[str, Any]]:
    cursor = db["tokens"].find(
        {"project_id": project_id},
        {"token_hash": 0},
    ).sort("created_at", -1)
    docs = await cursor.to_list(length=None)
    for doc in docs:
        doc["token_id"] = str(doc.pop("_id"))
    return docs


async def admin_revoke_token(
    db: AsyncIOMotorDatabase, project_id: str, token_id: str
) -> dict[str, Any] | None:
    from bson import ObjectId
    try:
        oid = ObjectId(token_id)
    except Exception:
        return None
    doc = await db["tokens"].find_one(
        {"_id": oid, "project_id": project_id, "status": "active"},
    )
    if not doc:
        return None
    await db["tokens"].update_one(
        {"_id": oid},
        {"$set": {"status": "revoked", "revoked_at": datetime.now(timezone.utc)}},
    )
    return doc


# ---------------------------------------------------------------------------
# Admin helpers — projects
# ---------------------------------------------------------------------------


async def admin_get_project(
    db: AsyncIOMotorDatabase, project_id: str
) -> dict[str, Any] | None:
    return await db["projects"].find_one(
        {"project_id": project_id},
        {"_id": 0, "settings.pii_salt": 0},
    )


async def admin_update_project_settings(
    db: AsyncIOMotorDatabase,
    project_id: str,
    updates: dict[str, Any],
) -> bool:
    result = await db["projects"].update_one(
        {"project_id": project_id},
        {"$set": {f"settings.{k}": v for k, v in updates.items()}},
    )
    return result.matched_count > 0


# ---------------------------------------------------------------------------
# Admin helpers — event routes
# ---------------------------------------------------------------------------


async def admin_get_event_route(
    db: AsyncIOMotorDatabase, topic: str
) -> dict[str, Any] | None:
    return await db["event_routes"].find_one({"topic": topic}, {"_id": 0})


async def admin_create_event_route(
    db: AsyncIOMotorDatabase, doc: dict[str, Any]
) -> None:
    await db["event_routes"].insert_one(doc)


async def admin_delete_event_route(
    db: AsyncIOMotorDatabase, topic: str
) -> bool:
    result = await db["event_routes"].delete_one({"topic": topic})
    return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Admin helpers — users
# ---------------------------------------------------------------------------


async def admin_get_user(
    db: AsyncIOMotorDatabase, project_id: str, user_id: str
) -> dict[str, Any] | None:
    return await db["users"].find_one(
        {"project_id": project_id, "user_id": user_id},
        {"_id": 0},
    )


async def admin_delete_user(
    db: AsyncIOMotorDatabase, project_id: str, user_id: str
) -> bool:
    result = await db["users"].delete_one(
        {"project_id": project_id, "user_id": user_id}
    )
    return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Admin helpers — campaign runs
# ---------------------------------------------------------------------------


async def list_campaign_runs(
    db: AsyncIOMotorDatabase, project_id: str, campaign_id: str
) -> list[dict[str, Any]]:
    cursor = db["campaign_runs"].find(
        {"project_id": project_id, "campaign_id": campaign_id},
        {"_id": 0},
    ).sort("created_at", -1)
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
