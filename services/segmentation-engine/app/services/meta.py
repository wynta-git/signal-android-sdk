import asyncio
import json
import time
from datetime import datetime
from typing import Any

import structlog
from clickhouse_connect.driver.asyncclient import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from shared.clients.mongo import get_field_aliases, get_trait_schema

log = structlog.get_logger()

_SOFT_TTL = 300   # return stale + background-refresh after this many seconds
_HARD_TTL = 600   # Redis key absolute expiry

_PROP_TYPE_SOFT_TTL = 86400 * 7   # 7 days
_PROP_TYPE_HARD_TTL = 86400 * 30  # 30 days

_OPERATORS: dict[str, list[str]] = {
    "frequency": ["eq", "neq", "gt", "gte", "lt", "lte"],
    "property":  ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "starts_with", "exists"],
    "trait":     ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "starts_with", "exists"],
}

_OPERATORS_BY_TYPE: dict[str, list[str]] = {
    "number":   ["eq", "neq", "gt", "gte", "lt", "lte", "between", "exists"],
    "string":   ["eq", "neq", "contains", "starts_with", "in", "not_in", "exists"],
    "boolean":  ["eq", "exists"],
    "datetime": ["before", "after", "between", "within_last", "exists"],
}


def _infer_type(values: list[Any]) -> str:
    if not values:
        return "string"

    # Native Python bool (ClickHouse Bool column)
    if all(isinstance(v, bool) for v in values):
        return "boolean"

    # Native Python numeric (Float64/Int64 base columns like amount)
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        return "number"

    # Nullable(String) dynamic columns — values arrive as strings
    str_vals = [str(v).strip().lower() for v in values]

    # Boolean strings — only when exclusively true/false/yes/no/0/1
    if all(s in {"true", "false", "yes", "no", "0", "1"} for s in str_vals):
        return "boolean"

    # Numeric strings
    try:
        [float(s) for s in str_vals]
        return "number"
    except ValueError:
        pass

    # ISO datetime strings
    try:
        [datetime.fromisoformat(s) for s in str_vals]
        return "datetime"
    except ValueError:
        pass

    return "string"


class MetaService:
    def __init__(self) -> None:
        self._refreshing: set[str] = set()

    async def get_events(
        self, project_id: str, ch: AsyncClient, redis: Redis, db: AsyncIOMotorDatabase
    ) -> dict:
        raw_key = f"meta:{project_id}:events"
        derived_key = f"meta:{project_id}:derived_rule_ids"
        raw_events, derived_rules = await asyncio.gather(
            self._cached(raw_key, redis, lambda: self._fetch_events(project_id, ch)),
            self._cached(derived_key, redis, lambda: self._fetch_derived_rule_ids(project_id, db)),
        )
        return {"raw_events": raw_events, "derived_rules": derived_rules}

    async def get_derived_rule(
        self, project_id: str, rule_id: str, db: AsyncIOMotorDatabase
    ) -> dict | None:
        from app import storage
        doc = await storage.get_derived_rule(db, project_id, rule_id)
        if doc is None:
            return None
        return {
            "id": doc["rule_id"],
            "name": doc["name"],
            "parameters": doc.get("parameters", []),
        }

    async def get_event_properties(
        self, project_id: str, event_name: str, ch: AsyncClient, redis: Redis, db: AsyncIOMotorDatabase
    ) -> list[str]:
        key = f"meta:{project_id}:event_props:{event_name}"
        return await self._cached(
            key, redis, lambda: self._fetch_event_properties(project_id, event_name, ch, db)
        )

    async def get_traits(
        self, project_id: str, db: AsyncIOMotorDatabase, redis: Redis
    ) -> list[str]:
        key = f"meta:{project_id}:traits"
        return await self._cached(key, redis, lambda: self._fetch_traits(project_id, db))

    def get_operators(self) -> dict[str, Any]:
        return _OPERATORS

    async def get_trait_operators(
        self, project_id: str, trait_name: str, db: AsyncIOMotorDatabase, redis: Redis
    ) -> dict[str, Any]:
        key = f"meta:{project_id}:trait_operators:{trait_name}"
        raw = await redis.get(key)
        if raw is not None:
            blob = json.loads(raw)
            if time.time() - blob["ts"] < _PROP_TYPE_SOFT_TTL:
                return blob["data"]

        schema = await get_trait_schema(db, project_id, trait_name)
        if schema:
            trait_type = schema["type"]
        else:
            trait_type = await self._fetch_trait_type_from_users(project_id, trait_name, db)

        data = {"type": trait_type, "operators": _OPERATORS_BY_TYPE[trait_type]}
        await redis.set(
            key,
            json.dumps({"data": data, "ts": time.time()}),
            ex=_PROP_TYPE_HARD_TTL,
        )
        return data

    async def get_property_operators(
        self,
        project_id: str,
        event_name: str,
        prop_name: str,
        ch: AsyncClient,
        redis: Redis,
        db: AsyncIOMotorDatabase,
    ) -> dict[str, Any]:
        key = f"meta:{project_id}:prop_operators:{event_name}:{prop_name}"
        raw = await redis.get(key)
        if raw is not None:
            blob = json.loads(raw)
            if time.time() - blob["ts"] > _PROP_TYPE_SOFT_TTL and key not in self._refreshing:
                asyncio.create_task(
                    self._refresh_prop_type(key, redis, project_id, event_name, prop_name, ch, db)
                )
            return blob["data"]

        prop_type = await self._fetch_property_type(project_id, event_name, prop_name, ch, db)
        data = {"type": prop_type, "operators": _OPERATORS_BY_TYPE[prop_type]}
        await redis.set(
            key,
            json.dumps({"data": data, "ts": time.time()}),
            ex=_PROP_TYPE_HARD_TTL,
        )
        return data

    # ── cache helpers ─────────────────────────────────────────────────────────

    async def _cached(self, key: str, redis: Redis, fetch_fn) -> list[Any]:
        raw = await redis.get(key)
        if raw is not None:
            blob = json.loads(raw)
            if time.time() - blob["ts"] > _SOFT_TTL and key not in self._refreshing:
                asyncio.create_task(self._refresh(key, redis, fetch_fn))
            return blob["data"]

        data = await fetch_fn()
        await self._store(key, redis, data)
        return data

    async def _refresh(self, key: str, redis: Redis, fetch_fn) -> None:
        self._refreshing.add(key)
        try:
            data = await fetch_fn()
            await self._store(key, redis, data)
        except Exception as exc:
            log.warning("meta_cache.refresh_failed", key=key, error=str(exc))
        finally:
            self._refreshing.discard(key)

    async def _store(self, key: str, redis: Redis, data: list[Any]) -> None:
        blob = json.dumps({"data": data, "ts": time.time()})
        await redis.set(key, blob, ex=_HARD_TTL)

    # ── fetchers ──────────────────────────────────────────────────────────────

    async def _fetch_events(self, project_id: str, ch: AsyncClient) -> list[str]:
        table = f"pam.events_{project_id}"
        try:
            result = await ch.query(
                f"SELECT DISTINCT event_name FROM {table} ORDER BY event_name LIMIT 1000"
            )
            return [row[0] for row in result.result_rows]
        except Exception as exc:
            log.warning("meta.fetch_events_failed", project_id=project_id, error=str(exc))
            return []

    _FIXED_COLS = frozenset({
        "event_id", "event_name", "schema_version", "project_id", "user_id",
        "session_id", "timestamp", "received_at", "sdk_name", "sdk_version",
        "platform", "os", "insert_date",
    })

    async def _fetch_event_properties(
        self, project_id: str, event_name: str, ch: AsyncClient, db: AsyncIOMotorDatabase
    ) -> list[str]:
        table = f"events_{project_id}"
        ch_props: list[str] = []
        try:
            # Step 1: get dynamic column names (client-sent properties)
            cols_result = await ch.query(
                "SELECT name FROM system.columns "
                "WHERE database = 'pam' AND table = {table:String}",
                parameters={"table": table},
            )
            dynamic_cols = [
                row[0] for row in cols_result.result_rows
                if row[0] not in self._FIXED_COLS
            ]

            if dynamic_cols:
                # Step 2: check which columns have at least one non-null value for this event
                checks = ", ".join(
                    f"countIf(`{col}` IS NOT NULL) > 0" for col in dynamic_cols
                )
                check_result = await ch.query(
                    f"SELECT {checks} FROM pam.{table} "
                    f"WHERE event_name = {{event_name:String}}",
                    parameters={"event_name": event_name},
                )
                if check_result.result_rows:
                    row = check_result.result_rows[0]
                    ch_props = [col for col, has_value in zip(dynamic_cols, row) if has_value]
        except Exception as exc:
            log.warning(
                "meta.fetch_event_properties_failed",
                project_id=project_id,
                event_name=event_name,
                error=str(exc),
            )

        aliases = await get_field_aliases(db, project_id, event_name)
        return sorted(set(ch_props) | set(aliases.keys()))

    async def _refresh_prop_type(
        self,
        key: str,
        redis: Redis,
        project_id: str,
        event_name: str,
        prop_name: str,
        ch: AsyncClient,
        db: AsyncIOMotorDatabase,
    ) -> None:
        self._refreshing.add(key)
        try:
            prop_type = await self._fetch_property_type(project_id, event_name, prop_name, ch, db)
            data = {"type": prop_type, "operators": _OPERATORS_BY_TYPE[prop_type]}
            await redis.set(
                key,
                json.dumps({"data": data, "ts": time.time()}),
                ex=_PROP_TYPE_HARD_TTL,
            )
        except Exception as exc:
            log.warning("meta_cache.refresh_prop_type_failed", key=key, error=str(exc))
        finally:
            self._refreshing.discard(key)

    async def _fetch_property_type(
        self,
        project_id: str,
        event_name: str,
        prop_name: str,
        ch: AsyncClient,
        db: AsyncIOMotorDatabase,
    ) -> str:
        aliases = await get_field_aliases(db, project_id, event_name)
        col = aliases.get(prop_name, prop_name)

        table = f"pam.events_{project_id}"
        try:
            result = await ch.query(
                f"SELECT `{col}` FROM {table} "
                f"WHERE event_name = {{event_name:String}} AND `{col}` IS NOT NULL "
                f"LIMIT 200",
                parameters={"event_name": event_name},
            )
            values = [row[0] for row in result.result_rows]
        except Exception as exc:
            log.warning(
                "meta.fetch_property_type_failed",
                project_id=project_id,
                event_name=event_name,
                prop=prop_name,
                error=str(exc),
            )
            return "string"

        return _infer_type(values)

    async def _fetch_trait_type_from_users(
        self, project_id: str, trait_name: str, db: AsyncIOMotorDatabase
    ) -> str:
        cursor = db["users"].find(
            {"project_id": project_id, f"traits.{trait_name}": {"$exists": True}},
            {f"traits.{trait_name}": 1, "_id": 0},
        ).limit(200)
        docs = await cursor.to_list(length=None)
        values = [d["traits"][trait_name] for d in docs if trait_name in d.get("traits", {})]
        return _infer_type(values)

    async def _fetch_derived_rule_ids(
        self, project_id: str, db: AsyncIOMotorDatabase
    ) -> list[str]:
        from app import storage
        rules = await storage.list_derived_rules(db, project_id)
        return [r["rule_id"] for r in rules]

    async def _fetch_traits(self, project_id: str, db: AsyncIOMotorDatabase) -> list[str]:
        pipeline = [
            {"$match": {"project_id": project_id}},
            {"$project": {"keys": {"$objectToArray": "$traits"}}},
            {"$unwind": "$keys"},
            {"$group": {"_id": "$keys.k"}},
            {"$sort": {"_id": 1}},
            {"$limit": 500},
        ]
        cursor = db["users"].aggregate(pipeline)
        docs = await cursor.to_list(length=None)
        return [d["_id"] for d in docs]
