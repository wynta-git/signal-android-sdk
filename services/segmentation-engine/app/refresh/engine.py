import re
from datetime import datetime, timezone
from typing import Any

import structlog
from clickhouse_connect.driver.asyncclient import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app import storage
from app.dsl.compiler import CompiledRule, compile_rule
from app.dsl.validator import DerivedFilter, DidNotDoFilter, EventFilter, SegmentRule
from shared.clients.mongo import get_field_aliases, load_col_map
from shared.clients.redis import hgetall

log = structlog.get_logger()

_COL_MAP_PREFIX = "pam:col_map"


def _render_derived_sql(
    template: str,
    param_defs: list[dict[str, Any]],
    project_id: str,
    user_params: dict[str, Any],
) -> str:
    type_map = {p["key"]: p["type"] for p in param_defs}
    subs: dict[str, str] = {"project_id": project_id}
    for key, value in user_params.items():
        if type_map.get(key) != "number":
            raise ValueError(f"Only 'number' parameters are supported, got '{type_map.get(key)}' for '{key}'")
        subs[key] = str(float(value))

    def _replace(m: re.Match) -> str:
        k = m.group(1)
        if k not in subs:
            raise ValueError(f"Unknown placeholder '{{{k}}}' in derived rule SQL")
        return subs[k]

    return re.sub(r"\{(\w+)\}", _replace, template)


async def _execute_derived_filter(
    f: DerivedFilter,
    project_id: str,
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    user_id: str | None = None,
) -> set[str]:
    rule_doc = await storage.get_derived_rule(db, project_id, f.rule_id)
    if not rule_doc:
        log.warning("derived_rule.not_found", project_id=project_id, rule_id=f.rule_id)
        return set()

    sql = _render_derived_sql(rule_doc["sql"], rule_doc.get("parameters", []), project_id, f.parameters)

    if user_id is not None:
        sql = f"SELECT user_id FROM ({sql}) AS _d WHERE user_id = {{target_user:String}}"
        rows = await ch.query(sql, parameters={"target_user": user_id})
    else:
        rows = await ch.query(sql)

    return {row[0] for row in rows.result_rows}


async def _get_col_map(
    project_id: str,
    redis: Redis,
    db: AsyncIOMotorDatabase,
) -> dict[str, str]:
    """Return col_map from Redis; fall back to MongoDB if Redis is cold."""
    col_map: dict[str, str] = await hgetall(redis, f"{_COL_MAP_PREFIX}:{project_id}")
    if not col_map:
        col_map = await load_col_map(db, project_id)
        if col_map:
            log.warning("col_map_redis_miss_mongo_fallback", project_id=project_id)
    return col_map


async def _build_col_map(
    project_id: str,
    rule: SegmentRule,
    redis: Redis,
    db: AsyncIOMotorDatabase,
) -> dict[str, str]:
    """Return col_map enriched with field alias mappings for all event names in the rule."""
    col_map = await _get_col_map(project_id, redis, db)

    event_names = {
        f.event_name
        for f in rule.filters
        if isinstance(f, (EventFilter, DidNotDoFilter))
    }
    for event_name in event_names:
        aliases = await get_field_aliases(db, project_id, event_name)
        col_map = {**col_map, **aliases}

    return col_map


async def evaluate_segment(
    project_id: str,
    segment_id: str,
    rule: SegmentRule,
    db: AsyncIOMotorDatabase,
    ch: AsyncClient,
    redis: Redis,
    brand_id: str | None = None,
) -> set[str]:
    """
    Run all compiled queries for a segment and return the final user_id set.
    Also persists memberships and updates segment metadata.
    """
    col_map = await _build_col_map(project_id, rule, redis, db)
    compiled = compile_rule(rule, project_id, col_map, brand_id)
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
        members = await storage.get_segment_member_ids(redis, project_id, seg_id)
        user_id_sets.append(members)

    for f in compiled.derived_filters:
        user_id_sets.append(await _execute_derived_filter(f, project_id, db, ch))

    if not user_id_sets:
        final: set[str] = set()
    elif compiled.match == "all":
        final = user_id_sets[0].intersection(*user_id_sets[1:])
    else:
        final = user_id_sets[0].union(*user_id_sets[1:])

    await storage.delete_memberships(redis, project_id, segment_id)
    await storage.bulk_upsert_memberships(redis, project_id, segment_id, final)

    await storage.update_segment_size(
        db, project_id, segment_id, len(final), datetime.now(tz=timezone.utc)
    )

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
    brand_id: str | None = None,
) -> bool:
    """
    Re-evaluate membership for a single user. Used by event-driven refresh.
    Returns True if the user is now a member.
    """
    col_map = await _build_col_map(project_id, rule, redis, db)
    compiled = compile_rule(rule, project_id, col_map, brand_id)
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
        members = await storage.get_segment_member_ids(redis, project_id, seg_id)
        per_filter_results.append(user_id in members)

    for f in compiled.derived_filters:
        result = await _execute_derived_filter(f, project_id, db, ch, user_id=user_id)
        per_filter_results.append(len(result) > 0)

    if not per_filter_results:
        is_member = False
    elif compiled.match == "all":
        is_member = all(per_filter_results)
    else:
        is_member = any(per_filter_results)

    if is_member:
        await storage.upsert_membership(redis, project_id, segment_id, user_id)
    else:
        await storage.remove_membership(redis, project_id, segment_id, user_id)

    return is_member
