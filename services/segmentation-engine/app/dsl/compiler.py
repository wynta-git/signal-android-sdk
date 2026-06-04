from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.dsl.validator import (
    AnyFilter,
    DerivedFilter,
    DidNotDoFilter,
    EventFilter,
    InSegmentFilter,
    SegmentRule,
    TraitFilter,
)

# Maps DSL property operators to ClickHouse SQL operators
_CH_OP_MAP: dict[str, str] = {
    "eq": "=",
    "neq": "!=",
    "gt": ">",
    "gte": ">=",
    "lt": "<",
    "lte": "<=",
}

# Maps DSL trait operators to MongoDB comparison operators
_MONGO_OP_MAP: dict[str, str] = {
    "eq": "$eq",
    "neq": "$ne",
    "gt": "$gt",
    "gte": "$gte",
    "lt": "$lt",
    "lte": "$lte",
    "in": "$in",
    "not_in": "$nin",
}


@dataclass
class CompiledEventQuery:
    """ClickHouse SQL that returns matching user_ids for one event filter."""
    sql: str
    params: dict[str, object] = field(default_factory=dict)


@dataclass
class CompiledTraitQuery:
    """MongoDB aggregation pipeline that returns matching user_ids for one trait filter."""
    pipeline: list[dict]


@dataclass
class CompiledRule:
    """All compiled queries for a segment rule, ready to execute."""
    match: str  # "all" | "any"
    event_queries: list[CompiledEventQuery] = field(default_factory=list)
    trait_queries: list[CompiledTraitQuery] = field(default_factory=list)
    did_not_do_queries: list[CompiledEventQuery] = field(default_factory=list)
    in_segment_ids: list[str] = field(default_factory=list)
    derived_filters: list[DerivedFilter] = field(default_factory=list)


def compile_rule(rule: SegmentRule, project_id: str, col_map: dict[str, str], brand_id: str | None = None) -> CompiledRule:
    compiled = CompiledRule(match=rule.match)
    for f in rule.filters:
        _compile_filter(f, project_id, compiled, col_map, brand_id)
    return compiled


def _compile_filter(f: AnyFilter, project_id: str, compiled: CompiledRule, col_map: dict[str, str], brand_id: str | None = None) -> None:
    if isinstance(f, EventFilter):
        compiled.event_queries.append(_compile_event_filter(f, project_id, col_map, brand_id))
    elif isinstance(f, TraitFilter):
        compiled.trait_queries.append(_compile_trait_filter(f, project_id))
    elif isinstance(f, DidNotDoFilter):
        compiled.did_not_do_queries.append(_compile_did_not_do_filter(f, project_id, brand_id))
    elif isinstance(f, InSegmentFilter):
        compiled.in_segment_ids.append(f.segment_id)
    elif isinstance(f, DerivedFilter):
        compiled.derived_filters.append(f)


def _compile_event_filter(f: EventFilter, project_id: str, col_map: dict[str, str], brand_id: str | None = None) -> CompiledEventQuery:
    since = _since_timestamp(f.time_window.last_days)
    params: dict[str, object] = {
        "project_id": project_id,
        "event_name": f.event_name,
        "since": since,
    }

    where_clauses = [
        "project_id = {project_id:String}",
        "event_name = {event_name:String}",
        "timestamp >= {since:DateTime}",
    ]

    if brand_id:
        where_clauses.append("brand_id = {brand_id:String}")
        params["brand_id"] = brand_id

    for idx, (prop_key, constraint) in enumerate(f.where.items()):
        param_key = f"prop_val_{idx}"
        col_name = col_map.get(prop_key)

        if col_name is None:
            # Column not in this project's table — no event can satisfy this constraint.
            where_clauses.append("1=0")
            continue

        if constraint.op == "exists":
            where_clauses.append(f"isNotNull({col_name})")
        elif constraint.op in ("in", "not_in"):
            ch_op = "IN" if constraint.op == "in" else "NOT IN"
            params[param_key] = constraint.value
            where_clauses.append(f"{col_name} {ch_op} {{{param_key}:Array(String)}}")
        elif constraint.op == "contains":
            params[param_key] = str(constraint.value)
            where_clauses.append(f"positionCaseInsensitive({col_name}, {{{param_key}:String}}) > 0")
        elif constraint.op == "starts_with":
            params[param_key] = str(constraint.value)
            where_clauses.append(f"startsWith({col_name}, {{{param_key}:String}})")
        else:
            ch_op = _CH_OP_MAP[constraint.op]
            params[param_key] = str(constraint.value)
            where_clauses.append(f"{col_name} {ch_op} {{{param_key}:String}}")

    freq_op = _CH_OP_MAP[f.frequency.op]
    freq_param = "freq_count"
    params[freq_param] = f.frequency.count

    table = f"pam.events_{project_id}"
    where_sql = " AND ".join(where_clauses)
    sql = (
        f"SELECT user_id FROM {table}"
        f" WHERE {where_sql}"
        f" GROUP BY user_id"
        f" HAVING count() {freq_op} {{{freq_param}:UInt64}}"
    )
    return CompiledEventQuery(sql=sql, params=params)


def _compile_did_not_do_filter(f: DidNotDoFilter, project_id: str, brand_id: str | None = None) -> CompiledEventQuery:
    since = _since_timestamp(f.time_window.last_days)
    params: dict[str, object] = {
        "project_id": project_id,
        "event_name": f.event_name,
        "since": since,
    }
    # Returns user_ids that have NOT done the event in the window.
    # Strategy: all project users minus those who did the event.
    table = f"pam.events_{project_id}"
    outer_brand_clause = ""
    inner_brand_clause = ""
    if brand_id:
        params["brand_id"] = brand_id
        outer_brand_clause = " AND brand_id = {brand_id:String}"
        inner_brand_clause = " AND brand_id = {brand_id:String}"
    sql = (
        f"SELECT DISTINCT user_id FROM {table}"
        " WHERE project_id = {project_id:String}"
        f"{outer_brand_clause}"
        " AND user_id NOT IN ("
        f"   SELECT DISTINCT user_id FROM {table}"
        "   WHERE project_id = {project_id:String}"
        f"{inner_brand_clause}"
        "   AND event_name = {event_name:String}"
        "   AND timestamp >= {since:DateTime}"
        " )"
    )
    return CompiledEventQuery(sql=sql, params=params)


def _compile_trait_filter(f: TraitFilter, project_id: str) -> CompiledTraitQuery:
    trait_path = f"traits.{f.trait}"
    match_expr: dict

    if f.op == "exists":
        match_expr = {trait_path: {"$exists": True}}
    elif f.op in ("in", "not_in"):
        mongo_op = _MONGO_OP_MAP[f.op]
        match_expr = {trait_path: {mongo_op: f.value}}
    elif f.op == "contains":
        match_expr = {trait_path: {"$regex": str(f.value), "$options": "i"}}
    elif f.op == "starts_with":
        match_expr = {trait_path: {"$regex": f"^{f.value}", "$options": "i"}}
    else:
        mongo_op = _MONGO_OP_MAP[f.op]
        match_expr = {trait_path: {mongo_op: f.value}}

    pipeline = [
        {"$match": {"project_id": project_id, **match_expr}},
        {"$project": {"_id": 0, "user_id": 1}},
    ]
    return CompiledTraitQuery(pipeline=pipeline)


def _since_timestamp(last_days: int) -> datetime:
    return datetime.now(tz=timezone.utc) - timedelta(days=last_days)
