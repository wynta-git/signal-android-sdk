import asyncio
from datetime import date, datetime, timedelta, timezone
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
    # One-off polling: status + type + send_at + picked
    await db["campaigns"].create_index(
        [("status", 1), ("trigger.type", 1), ("trigger.send_at", 1), ("picked", 1)]
    )
    # Cron polling: status + type + next_run_at + picked
    await db["campaigns"].create_index(
        [("status", 1), ("trigger.type", 1), ("next_run_at", 1), ("picked", 1)]
    )
    # Stale-lock recovery: picked + picked_at
    await db["campaigns"].create_index([("picked", 1), ("picked_at", 1)])
    await db["campaign_runs"].create_index(
        [("project_id", 1), ("campaign_id", 1), ("status", 1)]
    )
    await db["campaign_runs"].create_index([("project_id", 1), ("run_id", 1)], unique=True)
    await db["notification_templates"].create_index(
        [("project_id", 1), ("template_id", 1)], unique=True
    )
    await db["custom_reports"].create_index([("user_id", 1), ("project_id", 1)])
    await db["custom_reports"].create_index([("report_id", 1)], unique=True)


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
    brand_id: str | None = None,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"project_id": project_id}
    if status:
        query["status"] = status
    if brand_id is not None:
        query["brand_id"] = brand_id
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
    db: AsyncIOMotorDatabase, project_id: str, event_name: str, brand_id: str | None = None
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {
        "project_id": project_id,
        "status": "running",
        "trigger.type": "event",
        "trigger.event_name": event_name,
    }
    if brand_id:
        # Brand-scoped campaigns for this brand + project-wide campaigns (brand_id null/missing)
        query["$or"] = [{"brand_id": brand_id}, {"brand_id": None}]
    else:
        # Event has no brand — only project-wide campaigns fire
        query["brand_id"] = None
    cursor = db["campaigns"].find(query, {"_id": 0})
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


# ---------------------------------------------------------------------------
# Scheduler-service helpers — atomic locking, recovery, completion
# ---------------------------------------------------------------------------


async def lock_due_oneoff_campaign(
    db: AsyncIOMotorDatabase, now: datetime
) -> dict[str, Any] | None:
    """Atomically claim the next due one-off campaign. Returns the locked doc or None."""
    return await db["campaigns"].find_one_and_update(
        {
            "status": "scheduled",
            "trigger.type": "one_off",
            "trigger.send_at": {"$lte": now},
            "picked": False,
        },
        {"$set": {"picked": True, "picked_at": now}},
        projection={"_id": 0},
        return_document=True,
    )


async def lock_due_cron_campaign(
    db: AsyncIOMotorDatabase, now: datetime
) -> dict[str, Any] | None:
    """Atomically claim the next due cron campaign. Returns the locked doc or None."""
    return await db["campaigns"].find_one_and_update(
        {
            "status": "running",
            "trigger.type": "scheduled",
            "next_run_at": {"$lte": now},
            "picked": False,
        },
        {"$set": {"picked": True, "picked_at": now}},
        projection={"_id": 0},
        return_document=True,
    )


async def lock_due_immediate_campaign(
    db: AsyncIOMotorDatabase, now: datetime
) -> dict[str, Any] | None:
    """Atomically claim the next due immediate campaign. Returns the locked doc or None."""
    return await db["campaigns"].find_one_and_update(
        {
            "status": "running",
            "trigger.type": "immediate",
            "next_run_at": {"$lte": now},
            "picked": False,
        },
        {"$set": {"picked": True, "picked_at": now}},
        projection={"_id": 0},
        return_document=True,
    )


async def complete_oneoff_campaign(
    db: AsyncIOMotorDatabase, project_id: str, campaign_id: str
) -> None:
    await db["campaigns"].update_one(
        {"project_id": project_id, "campaign_id": campaign_id},
        {"$set": {"status": "completed", "updated_at": datetime.now(timezone.utc)}},
    )


async def reset_cron_campaign(
    db: AsyncIOMotorDatabase,
    project_id: str,
    campaign_id: str,
    next_run_at: datetime,
) -> None:
    await db["campaigns"].update_one(
        {"project_id": project_id, "campaign_id": campaign_id},
        {
            "$set": {
                "picked": False,
                "picked_at": None,
                "next_run_at": next_run_at,
                "retry_count": 0,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )


async def get_upcoming_campaigns_with_segments(
    db: AsyncIOMotorDatabase,
    now: datetime,
    horizon: datetime,
) -> list[dict[str, Any]]:
    """Return unpicked campaigns due between now and horizon that have a segment_id."""
    cursor = db["campaigns"].find(
        {
            "$or": [
                {
                    "status": "scheduled",
                    "trigger.type": "one_off",
                    "trigger.send_at": {"$gt": now, "$lte": horizon},
                    "picked": False,
                    "audience.segment_id": {"$exists": True, "$ne": ""},
                },
                {
                    "status": "running",
                    "trigger.type": "scheduled",
                    "next_run_at": {"$gt": now, "$lte": horizon},
                    "picked": False,
                    "audience.segment_id": {"$exists": True, "$ne": ""},
                },
            ]
        },
        {"_id": 0, "project_id": 1, "campaign_id": 1, "audience": 1},
    )
    return await cursor.to_list(length=None)


async def get_stale_locked_campaigns(
    db: AsyncIOMotorDatabase, stale_before: datetime
) -> list[dict[str, Any]]:
    """Return campaigns that have been picked but not completed within the timeout window."""
    cursor = db["campaigns"].find(
        {"picked": True, "picked_at": {"$lt": stale_before}},
        {"_id": 0, "campaign_id": 1, "project_id": 1, "picked_at": 1, "trigger": 1},
    )
    return await cursor.to_list(length=None)


async def reset_stale_lock(
    db: AsyncIOMotorDatabase,
    project_id: str,
    campaign_id: str,
    stale_before: datetime,
) -> bool:
    """Reset picked=false only if picked_at is still before stale_before (safe for concurrent recovery pods)."""
    result = await db["campaigns"].update_one(
        {
            "project_id": project_id,
            "campaign_id": campaign_id,
            "picked": True,
            "picked_at": {"$lt": stale_before},
        },
        {
            "$set": {
                "picked": False,
                "picked_at": None,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return result.modified_count > 0


async def increment_retry_count(
    db: AsyncIOMotorDatabase, project_id: str, campaign_id: str
) -> int:
    """Atomically increment retry_count and return the new value."""
    doc = await db["campaigns"].find_one_and_update(
        {"project_id": project_id, "campaign_id": campaign_id},
        {"$inc": {"retry_count": 1}},
        projection={"retry_count": 1, "_id": 0},
        return_document=True,
    )
    return doc["retry_count"] if doc else 0


async def get_campaign_run_by_run_id(
    db: AsyncIOMotorDatabase, run_id: str
) -> dict[str, Any] | None:
    """Look up a CampaignRun by run_id for idempotency checks."""
    return await db["campaign_runs"].find_one({"run_id": run_id}, {"_id": 0})


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
# Notifications-engine helpers
# ---------------------------------------------------------------------------


async def get_user(
    db: AsyncIOMotorDatabase, project_id: str, user_id: str
) -> dict[str, Any] | None:
    return await db["users"].find_one(
        {"project_id": project_id, "user_id": user_id},
        {"_id": 0},
    )


async def get_user_device_tokens(
    db: AsyncIOMotorDatabase,
    project_id: str,
    user_id: str,
    brand_id: str | None = None,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"project_id": project_id, "user_id": user_id}
    if brand_id is not None:
        query["brand_id"] = brand_id
    cursor = db["device_tokens"].find(query, {"_id": 0})
    tokens = await cursor.to_list(length=None)
    if tokens:
        return tokens

    # Fallback: read FCM token from users.traits.fcm_token
    user = await db["users"].find_one(
        {"project_id": project_id, "user_id": user_id},
        {"traits.fcm_token": 1, "_id": 0},
    )
    fcm_token = (user or {}).get("traits", {}).get("fcm_token")
    if fcm_token:
        return [{"token": fcm_token, "platform": "android", "project_id": project_id, "user_id": user_id, "brand_id": brand_id}]
    return []


async def get_project_fcm_credential(
    db: AsyncIOMotorDatabase, project_id: str, brand_id: str | None = None
) -> str | None:
    """Return the FCM service-account JSON string for a brand or project, or None if not configured."""
    if brand_id:
        brand_doc = await db["brand_settings"].find_one(
            {"project_id": project_id, "brand_id": brand_id},
            {"fcm_service_account_json": 1, "_id": 0},
        )
        if brand_doc and brand_doc.get("fcm_service_account_json"):
            return brand_doc["fcm_service_account_json"]

    doc = await db["projects"].find_one(
        {"project_id": project_id},
        {"settings.fcm_service_account_json": 1, "_id": 0},
    )
    if not doc:
        return None
    return (doc.get("settings") or {}).get("fcm_service_account_json")


async def upsert_brand_fcm_credential(
    db: AsyncIOMotorDatabase,
    project_id: str,
    brand_id: str,
    fcm_service_account_json: str,
    now: datetime,
) -> None:
    await db["brand_settings"].update_one(
        {"project_id": project_id, "brand_id": brand_id},
        {"$set": {"fcm_service_account_json": fcm_service_account_json, "updated_at": now},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


async def get_brand_fcm_settings(
    db: AsyncIOMotorDatabase, project_id: str, brand_id: str
) -> dict | None:
    return await db["brand_settings"].find_one(
        {"project_id": project_id, "brand_id": brand_id},
        {"_id": 0, "fcm_service_account_json": 1},
    )


async def create_notification_delivery_indexes(db: AsyncIOMotorDatabase) -> None:
    await db["notification_deliveries"].create_index(
        [("project_id", 1), ("campaign_id", 1), ("user_id", 1)]
    )
    await db["notification_deliveries"].create_index(
        [("project_id", 1), ("status", 1), ("attempted_at", -1)]
    )
    await db["notification_deliveries"].create_index(
        [("send_id", 1), ("token_hash", 1)], unique=True
    )
    await db["notification_deliveries"].create_index(
        "attempted_at",
        expireAfterSeconds=90 * 86400,
    )
    await db["device_tokens"].create_index(
        [("project_id", 1), ("user_id", 1)]
    )


async def upsert_device_token(
    db: AsyncIOMotorDatabase,
    project_id: str,
    user_id: str,
    token: str,
    platform: str,
    brand_id: str | None = None,
) -> None:
    await db["device_tokens"].update_one(
        {"project_id": project_id, "brand_id": brand_id, "user_id": user_id, "token": token},
        {"$set": {"platform": platform}},
        upsert=True,
    )


async def insert_notification_delivery(
    db: AsyncIOMotorDatabase, doc: dict[str, Any]
) -> str:
    from pymongo.errors import DuplicateKeyError
    try:
        result = await db["notification_deliveries"].insert_one(doc)
        return str(result.inserted_id)
    except DuplicateKeyError:
        return ""


async def update_notification_delivery_status(
    db: AsyncIOMotorDatabase,
    delivery_id: str,
    status: str,
    **kwargs: Any,
) -> None:
    from bson import ObjectId
    updates: dict[str, Any] = {"status": status, **kwargs}
    await db["notification_deliveries"].update_one(
        {"_id": ObjectId(delivery_id)},
        {"$set": updates},
    )


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


# ---------------------------------------------------------------------------
# Admin helpers — field aliases
# ---------------------------------------------------------------------------


async def get_field_aliases(
    db: AsyncIOMotorDatabase,
    project_id: str,
    event_name: str,
) -> dict[str, str]:
    doc = await db["field_aliases"].find_one(
        {"project_id": project_id, "event_name": event_name},
        {"aliases": 1, "_id": 0},
    )
    if not doc:
        return {}
    return doc.get("aliases") or {}


async def upsert_field_aliases(
    db: AsyncIOMotorDatabase,
    project_id: str,
    event_name: str,
    aliases: dict[str, str],
) -> None:
    now = datetime.now(timezone.utc)
    await db["field_aliases"].update_one(
        {"project_id": project_id, "event_name": event_name},
        {
            "$set": {"aliases": aliases, "updated_at": now},
            "$setOnInsert": {
                "project_id": project_id,
                "event_name": event_name,
                "created_at": now,
            },
        },
        upsert=True,
    )


async def merge_field_aliases(
    db: AsyncIOMotorDatabase,
    project_id: str,
    event_name: str,
    new_aliases: dict[str, str],
) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    await db["field_aliases"].update_one(
        {"project_id": project_id, "event_name": event_name},
        {
            "$set": {
                **{f"aliases.{k}": v for k, v in new_aliases.items()},
                "updated_at": now,
            },
            "$setOnInsert": {
                "project_id": project_id,
                "event_name": event_name,
                "created_at": now,
            },
        },
        upsert=True,
    )
    return await get_field_aliases(db, project_id, event_name)


async def list_field_aliases(
    db: AsyncIOMotorDatabase,
    project_id: str,
) -> list[dict[str, Any]]:
    cursor = db["field_aliases"].find(
        {"project_id": project_id},
        {"_id": 0, "project_id": 0},
    ).sort("event_name", 1)
    return await cursor.to_list(length=None)


def _infer_trait_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, datetime):
        return "datetime"
    if isinstance(value, str):
        try:
            datetime.fromisoformat(value)
            return "datetime"
        except ValueError:
            pass
        try:
            float(value)
            return "number"
        except ValueError:
            pass
        if value.strip().lower() in {"true", "false", "yes", "no"}:
            return "boolean"
    return "string"


async def upsert_trait_schemas(
    db: AsyncIOMotorDatabase,
    project_id: str,
    traits: dict[str, Any],
) -> None:
    now = datetime.now(tz=timezone.utc)
    for trait, value in traits.items():
        trait_type = _infer_trait_type(value)
        await db["trait_schemas"].update_one(
            {"project_id": project_id, "trait": trait},
            {"$setOnInsert": {"project_id": project_id, "trait": trait, "type": trait_type, "created_at": now}},
            upsert=True,
        )


async def get_trait_schema(
    db: AsyncIOMotorDatabase, project_id: str, trait: str
) -> dict[str, Any] | None:
    return await db["trait_schemas"].find_one(
        {"project_id": project_id, "trait": trait},
        {"_id": 0},
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
    brand_id: str | None = None,
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
        {"project_id": project_id, "brand_id": brand_id, "user_id": user_id},
        update,
        upsert=True,
    )
    if traits:
        await upsert_trait_schemas(db, project_id, traits)


# ---------------------------------------------------------------------------
# Dashboard helpers
# ---------------------------------------------------------------------------


async def get_dashboard_delivery_stats(
    db: AsyncIOMotorDatabase,
    project_id: str,
    since: datetime,
    until: datetime,
) -> list[dict[str, Any]]:
    """Aggregate notification_deliveries by (channel, status, date) for dashboard use."""
    pipeline = [
        {
            "$match": {
                "project_id": project_id,
                "attempted_at": {"$gte": since, "$lte": until},
            }
        },
        {
            "$group": {
                "_id": {
                    "channel": "$channel",
                    "status": "$status",
                    "date": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$attempted_at",
                        }
                    },
                },
                "count": {"$sum": 1},
            }
        },
    ]
    cursor = db["notification_deliveries"].aggregate(pipeline)
    return await cursor.to_list(length=None)


async def get_daily_boosts_range(
    db: AsyncIOMotorDatabase,
    project_id: str,
    since: datetime,
    until: datetime,
) -> dict[str, dict]:
    """Return {date_str: day_data} for daily_boosts entries within [since.date, until.date]."""
    doc = await db["dashboard_boosts"].find_one(
        {"project_id": project_id}, {"_id": 0, "daily_boosts": 1}
    )
    all_daily: dict = (doc or {}).get("daily_boosts", {})
    since_date = since.date()
    until_date = until.date()
    return {
        date_str: data
        for date_str, data in all_daily.items()
        if since_date <= date.fromisoformat(date_str) <= until_date
    }


async def get_dashboard_user_health(
    db: AsyncIOMotorDatabase,
    project_id: str,
) -> dict[str, int]:
    """
    Returns user counts bucketed by activity.
    Approximate: based on last_seen_at (updated on /identify only, not raw events).
    """
    now = datetime.now(timezone.utc)
    cutoff_30d = now - timedelta(days=30)
    cutoff_90d = now - timedelta(days=90)

    total, new, healthy, at_risk, churned = await asyncio.gather(
        db["users"].count_documents({"project_id": project_id}),
        db["users"].count_documents({
            "project_id": project_id,
            "first_seen_at": {"$gte": cutoff_30d},
        }),
        db["users"].count_documents({
            "project_id": project_id,
            "last_seen_at": {"$gte": cutoff_30d},
        }),
        db["users"].count_documents({
            "project_id": project_id,
            "last_seen_at": {"$gte": cutoff_90d, "$lt": cutoff_30d},
        }),
        db["users"].count_documents({
            "project_id": project_id,
            "last_seen_at": {"$lt": cutoff_90d},
        }),
    )

    return {
        "total_users": total,
        "new": new,
        "healthy": healthy,
        "at_risk": at_risk,
        "churned": churned,
    }


async def get_dashboard_channel_optin(
    db: AsyncIOMotorDatabase,
    project_id: str,
) -> dict[str, int]:
    """
    Opted-in user counts per channel.
    Push: distinct user_ids in device_tokens.
    Email/SMS: users with hashed trait present (approximate — hashed at identify time).
    """
    push_agg = await db["device_tokens"].aggregate([
        {"$match": {"project_id": project_id}},
        {"$group": {"_id": "$user_id"}},
        {"$count": "count"},
    ]).to_list(length=1)
    push_count = push_agg[0]["count"] if push_agg else 0

    email_count, sms_count = await asyncio.gather(
        db["users"].count_documents({
            "project_id": project_id,
            "traits.email_hash": {"$exists": True, "$ne": None},
        }),
        db["users"].count_documents({
            "project_id": project_id,
            "traits.phone_hash": {"$exists": True, "$ne": None},
        }),
    )

    return {"push": push_count, "email": email_count, "sms": sms_count}
