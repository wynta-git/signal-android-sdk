from datetime import datetime, timezone

import structlog
from clickhouse_connect.driver.asyncclient import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app import cache, storage
from app.config import settings
from app.dsl.compiler import CompiledRule, compile_rule
from app.dsl.validator import SegmentRule

log = structlog.get_logger()


async def evaluate_segment(
    project_id: str,
    segment_id: str,
    rule: SegmentRule,
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    redis: Redis,
) -> set[str]:
    """
    Run all compiled queries for a segment and return the final user_id set.
    Also persists memberships and updates segment metadata.
    """
    compiled = compile_rule(rule, project_id)
    user_id_sets: list[set[str]] = []

    for q in compiled.event_queries:
        rows = await ch.query(q.sql, parameters=q.params)
        user_id_sets.append({row[0] for row in rows.result_rows})

    for q in compiled.did_not_do_queries:
        rows = await ch.query(q.sql, parameters=q.params)
        user_id_sets.append({row[0] for row in rows.result_rows})

    for q in compiled.trait_queries:
        cursor = db["users"].aggregate(q.pipeline)
        docs = await cursor.to_list(length=None)
        user_id_sets.append({d["user_id"] for d in docs})

    for seg_id in compiled.in_segment_ids:
        members = await storage.get_segment_member_ids(db, project_id, seg_id)
        user_id_sets.append(members)

    if not user_id_sets:
        final: set[str] = set()
    elif compiled.match == "all":
        final = user_id_sets[0].intersection(*user_id_sets[1:])
    else:
        final = user_id_sets[0].union(*user_id_sets[1:])

    old_members = await storage.get_segment_member_ids(db, project_id, segment_id)

    await storage.delete_memberships(db, project_id, segment_id)
    await storage.bulk_upsert_memberships(db, project_id, segment_id, final)
    await storage.update_segment_size(
        db, project_id, segment_id, len(final), datetime.now(tz=timezone.utc)
    )

    affected_users = old_members | final
    await cache.invalidate_segment(redis, project_id, segment_id, affected_users)

    log.info(
        "segment.evaluated",
        project_id=project_id,
        segment_id=segment_id,
        size=len(final),
    )
    return final


async def evaluate_user_for_segment(
    project_id: str,
    segment_id: str,
    user_id: str,
    rule: SegmentRule,
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    redis: Redis,
) -> bool:
    """
    Re-evaluate membership for a single user. Used by event-driven refresh.
    Returns True if the user is now a member.
    """
    compiled = compile_rule(rule, project_id)
    per_filter_results: list[bool] = []

    for q in compiled.event_queries:
        sql = q.sql + f" AND user_id = {{target_user:String}}"
        params = {**q.params, "target_user": user_id}
        rows = await ch.query(sql, parameters=params)
        per_filter_results.append(len(rows.result_rows) > 0)

    for q in compiled.did_not_do_queries:
        sql = q.sql + f" AND user_id = {{target_user:String}}"
        params = {**q.params, "target_user": user_id}
        rows = await ch.query(sql, parameters=params)
        per_filter_results.append(len(rows.result_rows) > 0)

    for q in compiled.trait_queries:
        pipeline = [
            {"$match": {**q.pipeline[0]["$match"], "user_id": user_id}},
            q.pipeline[1],
        ]
        cursor = db["users"].aggregate(pipeline)
        docs = await cursor.to_list(length=1)
        per_filter_results.append(len(docs) > 0)

    for seg_id in compiled.in_segment_ids:
        members = await storage.get_segment_member_ids(db, project_id, seg_id)
        per_filter_results.append(user_id in members)

    if not per_filter_results:
        is_member = False
    elif compiled.match == "all":
        is_member = all(per_filter_results)
    else:
        is_member = any(per_filter_results)

    if is_member:
        await storage.upsert_membership(db, project_id, segment_id, user_id)
    else:
        await storage.remove_membership(db, project_id, segment_id, user_id)

    await cache.invalidate_user(redis, project_id, user_id)

    return is_member
