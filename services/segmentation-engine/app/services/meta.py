import asyncio
import json
import time
from typing import Any

import structlog
from clickhouse_connect.driver.asyncclient import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from shared.clients.mongo import get_field_aliases

log = structlog.get_logger()

_SOFT_TTL = 300   # return stale + background-refresh after this many seconds
_HARD_TTL = 600   # Redis key absolute expiry

_OPERATORS: dict[str, list[str]] = {
    "frequency": ["eq", "neq", "gt", "gte", "lt", "lte"],
    "property":  ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "starts_with", "exists"],
    "trait":     ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "starts_with", "exists"],
}


class MetaService:
    def __init__(self) -> None:
        self._refreshing: set[str] = set()

    async def get_events(self, project_id: str, ch: AsyncClient, redis: Redis) -> list[str]:
        key = f"meta:{project_id}:events"
        return await self._cached(key, redis, lambda: self._fetch_events(project_id, ch))

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

    async def _fetch_event_properties(
        self, project_id: str, event_name: str, ch: AsyncClient, db: AsyncIOMotorDatabase
    ) -> list[str]:
        table = f"pam.events_{project_id}"
        try:
            result = await ch.query(
                f"SELECT DISTINCT arrayJoin(mapKeys(properties)) AS prop "
                f"FROM {table} "
                f"WHERE event_name = {{event_name:String}} "
                f"ORDER BY prop LIMIT 1000",
                parameters={"event_name": event_name},
            )
            ch_props = [row[0] for row in result.result_rows]
        except Exception as exc:
            log.warning(
                "meta.fetch_event_properties_failed",
                project_id=project_id,
                event_name=event_name,
                error=str(exc),
            )
            ch_props = []

        aliases = await get_field_aliases(db, project_id, event_name)
        return sorted(set(ch_props) | set(aliases.keys()))

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
