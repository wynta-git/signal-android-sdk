import json
from datetime import datetime, timezone
from typing import Any

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis
from shared.clients.redis import pipeline_set_nx_ex
from shared.services.user import get_or_create_pam_user

from .alias_manager import AliasManager
from .profile_updater import ProfileUpdater
from .schema_manager import SchemaManager

log = structlog.get_logger()

# Base columns present in every per-client table (mirrors pam.events minus properties map).
_BASE_COLUMNS = [
    "event_id",
    "event_name",
    "schema_version",
    "project_id",
    "site_id",
    "client_id",
    "user_id",
    "session_id",
    "timestamp",
    "received_at",
    "platform",
    "device_type",
    "brand_id",
    "amount",
    "currency",
    "pam_user_id",
]

# Properties keys promoted to typed base columns — excluded from dynamic columns
# so they don't collide with the dedicated base column of the same sanitized name.
_PROMOTED_KEYS = frozenset({"amount", "currency"})

# Fields intentionally excluded from ClickHouse columns (base or dynamic).
# To drop a base column: add it here AND remove from _BASE_COLUMNS + _base_values().
# To drop a dynamic property column: add it here only.
_EXCLUDED_FIELDS: frozenset[str] = frozenset()


def _parse_dt(value: str | None) -> datetime:
    if value:
        return datetime.fromisoformat(value)
    return datetime.now(timezone.utc)


def _base_values(event: dict[str, Any]) -> list[Any]:
    props = event.get("properties") or {}

    amount_raw = props.get("amount")
    currency_raw = props.get("currency")

    amount: float | None = None
    if amount_raw is not None:
        try:
            amount = float(amount_raw)
        except (TypeError, ValueError):
            pass

    return [
        str(event["event_id"]),
        str(event.get("event_name", "")),
        int(event.get("schema_version") or 1),
        str(event.get("project_id") or ""),
        str(event.get("site_id") or ""),
        str(event.get("client_id") or ""),
        str(event["user_id"]),
        str(event.get("session_id") or ""),
        _parse_dt(event.get("timestamp")),
        _parse_dt(event.get("received_at") or event.get("timestamp")),
        str(event.get("platform") or ""),
        str(event.get("device_type") or ""),
        str(event.get("brand_id") or ""),
        amount,
        str(currency_raw) if currency_raw is not None else None,
        event.get("pam_user_id"),
    ]


def _to_row(
    event: dict[str, Any],
    col_map: dict[str, str],
    prop_cols: list[str],
) -> list[Any]:
    props = event.get("properties") or {}

    # Map each non-promoted property to its sanitized column name and stringify the value.
    prop_vals: dict[str, str] = {}
    for raw_key, value in props.items():
        if raw_key in _PROMOTED_KEYS or value is None:
            continue
        col = col_map.get(raw_key)
        if col is None:
            continue
        prop_vals[col] = json.dumps(value) if isinstance(value, (dict, list)) else str(value)

    # Base values + one slot per property column (None → NULL for Nullable(String)).
    return _base_values(event) + [prop_vals.get(col) for col in prop_cols]


_DEDUP_TTL = 86400  # 24 hours — covers any realistic client retry window


class ClickHouseWriter:
    def __init__(
        self,
        client: Any,
        schema_mgr: SchemaManager,
        redis: Redis,
        alias_mgr: AliasManager,
        profile_updater: ProfileUpdater,
        mongo_db: AsyncIOMotorDatabase | None = None,
    ) -> None:
        self._client = client
        self._schema_mgr = schema_mgr
        self._redis = redis
        self._alias_mgr = alias_mgr
        self._profile_updater = profile_updater
        self._mongo_db = mongo_db

    async def _resolve_pam_users(self, events: list[dict[str, Any]]) -> None:
        """Stamp each event with its pam_user_id, creating the mapping if needed.

        Distinct (site_id, user_id) pairs are resolved once per batch;
        get_or_create_pam_user serves repeat users from its Redis cache, so
        MySQL is queried (and the Mongo profile upserted) only for users it
        has never seen. Resolution failures leave pam_user_id as None and
        never fail the batch.
        """
        pairs: set[tuple[int, str]] = set()
        for e in events:
            raw_site_id = e.get("site_id")
            user_id = e.get("user_id")
            if not raw_site_id or not user_id:
                continue
            try:
                pairs.add((int(raw_site_id), str(user_id)))
            except (TypeError, ValueError):
                continue

        pam_ids: dict[tuple[int, str], int | None] = {}
        for site_id, user_id in pairs:
            try:
                pam_ids[(site_id, user_id)] = await get_or_create_pam_user(
                    self._redis, site_id, user_id, mongo_db=self._mongo_db
                )
            except Exception as exc:
                pam_ids[(site_id, user_id)] = None
                log.warning(
                    "pam_user_resolve_failed",
                    site_id=site_id, user_id=user_id, error=str(exc),
                )

        for e in events:
            raw_site_id = e.get("site_id")
            user_id = e.get("user_id")
            try:
                key = (int(raw_site_id), str(user_id)) if raw_site_id and user_id else None
            except (TypeError, ValueError):
                key = None
            e["pam_user_id"] = pam_ids.get(key) if key else None

    async def _filter_duplicates(
        self, project_id: str, events: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        if not events:
            return events

        keys = [f"pam:dedup:{project_id}:{e['event_id']}" for e in events]
        results = await pipeline_set_nx_ex(self._redis, keys, "1", _DEDUP_TTL)
        fresh = [e for e, is_new in zip(events, results) if is_new]
        dupes = len(events) - len(fresh)
        if dupes:
            log.warning("dedup_events_dropped", project_id=project_id, count=dupes)
        return fresh

    async def write_batch(self, project_id: str, events: list[dict[str, Any]]) -> None:
        events = await self._filter_duplicates(project_id, events)
        if not events:
            return

        # Resolve field aliases per event before schema inference and writing.
        resolved: list[dict[str, Any]] = []
        for e in events:
            props = e.get("properties") or {}
            event_name = str(e.get("event_name") or "")
            renamed = await self._alias_mgr.resolve(project_id, event_name, props)
            resolved.append({**e, "properties": renamed} if renamed is not props else e)
        events = resolved

        # Resolve pam user mappings (creates new users + Mongo profile once).
        await self._resolve_pam_users(events)

        # Ensure the per-client table exists (no-op after first call per instance).
        await self._schema_mgr.bootstrap_table(project_id)

        # Collect all non-promoted property keys across this batch.
        all_raw_keys: set[str] = set()
        for e in events:
            all_raw_keys.update(
                k for k in (e.get("properties") or {})
                if k not in _PROMOTED_KEYS and k not in _EXCLUDED_FIELDS
            )

        # Ensure every property key has a column; get the canonical raw→col mapping.
        col_map = await self._schema_mgr.ensure_columns(project_id, all_raw_keys)

        # Stable, sorted column order so all rows in this insert call align.
        # Exclude any property column that collides with a base column (e.g. a
        # property key that sanitizes to "user_id" would duplicate the base column).
        _base_col_set = set(_BASE_COLUMNS)
        prop_cols = sorted(c for c in set(col_map.values()) if c not in _base_col_set)
        column_names = _BASE_COLUMNS + prop_cols

        tbl = self._schema_mgr.table_name(project_id)
        rows = [_to_row(e, col_map, prop_cols) for e in events]
        await self._client.insert(tbl, rows, column_names=column_names)
        log.info("ch_batch_written", project_id=project_id, table=tbl, count=len(rows))

        await self._profile_updater.update_from_events(project_id, events)
