import json
from datetime import datetime, timezone
from typing import Any

import structlog
from redis.asyncio import Redis

from .schema_manager import SchemaManager

log = structlog.get_logger()

# Base columns present in every per-client table (mirrors pam.events minus properties map).
_BASE_COLUMNS = [
    "event_id",
    "event_name",
    "schema_version",
    "project_id",
    "user_id",
    "session_id",
    "timestamp",
    "received_at",
    "sdk_name",
    "sdk_version",
    "platform",
    "os",
    "amount",
    "currency",
    "order_id",
]

# Properties keys promoted to typed base columns — excluded from dynamic columns
# so they don't collide with the dedicated base column of the same sanitized name.
_PROMOTED_KEYS = frozenset({"amount", "currency", "order_id"})

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
    sdk = event.get("sdk") or {}
    device = event.get("device") or {}

    amount_raw = props.get("amount")
    currency_raw = props.get("currency")
    order_id_raw = props.get("order_id")

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
        str(event["user_id"]),
        str(event.get("session_id") or ""),
        _parse_dt(event.get("timestamp")),
        _parse_dt(event.get("received_at") or event.get("timestamp")),
        str(sdk.get("name") or ""),
        str(sdk.get("version") or ""),
        str(device.get("platform") or ""),
        str(device.get("os") or ""),
        amount,
        str(currency_raw) if currency_raw is not None else None,
        str(order_id_raw) if order_id_raw is not None else None,
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
    def __init__(self, client: Any, schema_mgr: SchemaManager, redis: Redis) -> None:
        self._client = client
        self._schema_mgr = schema_mgr
        self._redis = redis

    async def _filter_duplicates(
        self, project_id: str, events: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        if not events:
            return events

        keys = [f"pam:dedup:{project_id}:{e['event_id']}" for e in events]

        # Pipeline: SET NX EX for each event_id. Returns True if key was newly set.
        pipe = self._redis.pipeline()
        for key in keys:
            pipe.set(key, "1", nx=True, ex=_DEDUP_TTL)
        results = await pipe.execute()

        fresh = [e for e, is_new in zip(events, results) if is_new]
        dupes = len(events) - len(fresh)
        if dupes:
            log.warning("dedup_events_dropped", project_id=project_id, count=dupes)
        return fresh

    async def write_batch(self, project_id: str, events: list[dict[str, Any]]) -> None:
        events = await self._filter_duplicates(project_id, events)
        if not events:
            return

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
        prop_cols = sorted(set(col_map.values()))
        column_names = _BASE_COLUMNS + prop_cols

        tbl = self._schema_mgr.table_name(project_id)
        rows = [_to_row(e, col_map, prop_cols) for e in events]
        await self._client.insert(tbl, rows, column_names=column_names)
        log.info("ch_batch_written", project_id=project_id, table=tbl, count=len(rows))
