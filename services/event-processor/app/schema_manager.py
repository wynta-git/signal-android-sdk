import asyncio
import re
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from redis.asyncio import Redis
from shared.clients.redis import (
    delete_key,
    hget,
    hgetall,
    hmget,
    hsetnx,
    key_exists,
    pipeline_hsetnx_multi,
    set_nx_ex,
)

from .config import Settings, settings as _default_settings

log = structlog.get_logger()

_COL_MAP_PREFIX = "pam:col_map"
_MAX_COL_LEN = 64
_UNSAFE_CHARS = re.compile(r"[^a-z0-9_]")

# ClickHouse reserved words — append _col rather than using backtick quoting.
_CH_RESERVED = frozenset({
    "all", "alter", "and", "anti", "any", "array", "as", "ascending", "asof",
    "attach", "between", "both", "by", "case", "cast", "check", "cluster",
    "column", "columns", "comment", "constraint", "create", "cross", "cube",
    "database", "databases", "date", "default", "delete", "desc", "descending",
    "describe", "detach", "distinct", "distributed", "drop", "else", "end",
    "engine", "except", "exists", "explain", "fetch", "final", "first", "flush",
    "for", "format", "from", "full", "function", "global", "group", "having",
    "id", "if", "ilike", "in", "index", "inner", "insert", "interval", "into",
    "is", "join", "key", "kill", "last", "left", "like", "limit", "live",
    "local", "materialized", "move", "no", "not", "null", "nulls", "offset",
    "on", "optimize", "or", "order", "outer", "over", "partition", "populate",
    "primary", "projection", "range", "reload", "rename", "replace", "right",
    "rollup", "row", "rows", "sample", "select", "semi", "set", "settings",
    "show", "sum", "system", "table", "tables", "temporary", "then", "ties",
    "timestamp", "to", "top", "totals", "trim", "truncate", "ttl", "type",
    "union", "update", "use", "using", "values", "view", "when", "where", "with",
})


# DDL used to bootstrap a new per-client table.
# Mirrors pam.events base columns; properties keys become individual Nullable(String)
# columns added dynamically via ALTER TABLE … ADD COLUMN.
_CLIENT_TABLE_DDL = """\
CREATE TABLE IF NOT EXISTS {table}
(
    event_id       UUID,
    event_name     LowCardinality(String),
    schema_version UInt8,
    project_id     LowCardinality(String),
    user_id        String,
    session_id     String,
    timestamp      DateTime64(3, 'UTC'),
    received_at    DateTime64(3, 'UTC'),
    sdk_name       LowCardinality(String),
    sdk_version    String,
    platform       LowCardinality(String),
    os             LowCardinality(String),
    amount         Nullable(Float64),
    currency       LowCardinality(Nullable(String)),
    order_id       Nullable(String),
    insert_date    Date    DEFAULT toDate(received_at),
    created_at     DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(received_at)
PARTITION BY toYYYYMM(insert_date)
ORDER BY (project_id, event_name, user_id, timestamp, event_id)
TTL insert_date + INTERVAL 13 MONTH
SETTINGS index_granularity = 8192"""


class SchemaManager:
    """Per-client ClickHouse schema management: sanitization, column mapping, and DDL."""

    def __init__(self, redis: Redis, ch_client, cfg: Settings = _default_settings) -> None:
        self._redis = redis
        self._ch = ch_client
        self._cfg = cfg
        # In-memory column cache: {project_id: set[col_name]}
        # Populated on first access per project; updated after every ADD COLUMN.
        self._col_cache: dict[str, set[str]] = {}

    # ------------------------------------------------------------------
    # Column name sanitization
    # ------------------------------------------------------------------

    def sanitize_key(self, raw: str) -> str:
        """Map an arbitrary properties key to a safe ClickHouse column identifier."""
        col = raw.lower()
        col = _UNSAFE_CHARS.sub("_", col)
        col = col.strip("_") or "prop"
        if col[0].isdigit():
            col = f"prop_{col}"
        col = col[:_MAX_COL_LEN]
        if col in _CH_RESERVED:
            col = f"{col}_col"
        return col

    def table_name(self, project_id: str) -> str:
        """Return the fully-qualified ClickHouse table name for a client."""
        safe = _UNSAFE_CHARS.sub("_", project_id.lower()).strip("_") or "unknown"
        return f"{self._cfg.clickhouse_database}.events_{safe}"

    # ------------------------------------------------------------------
    # In-memory DESCRIBE TABLE cache
    # ------------------------------------------------------------------

    async def get_known_columns(self, project_id: str) -> set[str]:
        """Return the set of existing column names for the client's table.

        Hits ClickHouse on the first call per project_id; subsequent calls
        return from the in-process cache and cost no I/O.
        """
        if project_id in self._col_cache:
            return self._col_cache[project_id]

        tbl = self.table_name(project_id)
        result = await self._ch.query(f"DESCRIBE TABLE {tbl}")
        cols = {row[0] for row in result.result_rows}
        self._col_cache[project_id] = cols
        log.debug("ch_schema_loaded", project_id=project_id, table=tbl, column_count=len(cols))
        return cols

    def _update_cache(self, project_id: str, col_name: str) -> None:
        """Add a newly created column to the in-memory cache without re-fetching."""
        if project_id in self._col_cache:
            self._col_cache[project_id].add(col_name)

    def invalidate_cache(self, project_id: str) -> None:
        """Drop the cache entry so the next call re-fetches from ClickHouse."""
        self._col_cache.pop(project_id, None)

    # ------------------------------------------------------------------
    # Redis distributed lock (per project_id + column_name)
    # ------------------------------------------------------------------

    def _lock_key(self, project_id: str, col_name: str) -> str:
        return f"pam:schema_lock:{project_id}:{col_name}"

    @asynccontextmanager
    async def col_lock(self, project_id: str, col_name: str) -> AsyncIterator[bool]:
        """Async context manager that acquires a per-column DDL lock.

        Yields True  → this instance won; it must perform ADD COLUMN then release.
        Yields False → another instance holds the lock; caller should wait then recheck.

        The lock expires automatically after schema_lock_ttl_seconds so a crashed
        winner never blocks others indefinitely.
        """
        key = self._lock_key(project_id, col_name)
        ttl = self._cfg.schema_lock_ttl_seconds
        acquired = await set_nx_ex(self._redis, key, "1", ttl)
        try:
            yield acquired
        finally:
            if acquired:
                await delete_key(self._redis, key)

    async def wait_for_lock_release(self, project_id: str, col_name: str) -> None:
        """Poll until the lock key disappears or the timeout is exceeded.

        Called by losers after col_lock yields False. Once this returns the winner
        has committed the ADD COLUMN (or crashed and let the TTL expire), so the
        caller can safely re-check the column cache and proceed with the insert.
        """
        key = self._lock_key(project_id, col_name)
        poll_s = self._cfg.schema_lock_poll_ms / 1000
        deadline = asyncio.get_event_loop().time() + self._cfg.schema_lock_timeout_seconds

        while asyncio.get_event_loop().time() < deadline:
            if not await key_exists(self._redis, key):
                return
            await asyncio.sleep(poll_s)

        log.warning(
            "schema_lock_timeout",
            project_id=project_id,
            col_name=col_name,
            timeout_s=self._cfg.schema_lock_timeout_seconds,
        )

    # ------------------------------------------------------------------
    # Redis col_map: persistent raw-key → column-name mapping per project
    # ------------------------------------------------------------------

    async def get_col_name(self, project_id: str, raw_key: str) -> str:
        """Return the canonical column name for raw_key, writing to Redis on first sight."""
        map_key = f"{_COL_MAP_PREFIX}:{project_id}"
        cached = await hget(self._redis, map_key, raw_key)
        if cached:
            return cached

        col = self.sanitize_key(raw_key)
        # HSETNX is atomic — only the first writer wins; others read back the winner.
        await hsetnx(self._redis, map_key, raw_key, col)
        winner = await hget(self._redis, map_key, raw_key)
        return winner if winner else col

    # ------------------------------------------------------------------
    # Table bootstrap
    # ------------------------------------------------------------------

    async def bootstrap_table(self, project_id: str) -> None:
        """Create the per-client table if it does not already exist.

        Safe to call concurrently — CREATE TABLE IF NOT EXISTS is idempotent
        and ClickHouse serialises DDL internally.  Once the table is known to
        this instance (cache hit) the method returns immediately with no I/O.
        """
        if project_id in self._col_cache:
            return

        tbl = self.table_name(project_id)
        await self._ch.command(_CLIENT_TABLE_DDL.format(table=tbl))
        log.info("ch_table_bootstrapped", project_id=project_id, table=tbl)
        # Warm the column cache so the first ensure_columns call costs no extra I/O.
        await self.get_known_columns(project_id)

        # Backfill created_at on tables created before this column was introduced.
        # No-op for new tables since _CLIENT_TABLE_DDL already includes it.
        if "created_at" not in self._col_cache.get(project_id, set()):
            await self._ch.command(
                f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS created_at DateTime DEFAULT now()"
            )
            self._update_cache(project_id, "created_at")
            log.info("ch_created_at_backfilled", project_id=project_id, table=tbl)

    # ------------------------------------------------------------------
    # ensure_columns — public entry point called before every insert
    # ------------------------------------------------------------------

    async def ensure_columns(self, project_id: str, raw_keys: set[str]) -> dict[str, str]:
        """Guarantee every properties key exists as a column in the client's table.

        Returns {raw_key: col_name} so the caller can map values without a
        second round-trip.  Safe to call concurrently from multiple consumer
        instances — only the lock winner issues DDL; losers wait then continue.
        """
        if not raw_keys:
            return {}

        col_map = await self.get_col_map(project_id, raw_keys)
        known = await self.get_known_columns(project_id)
        tbl = self.table_name(project_id)

        new_cols = {col for col in col_map.values() if col not in known}
        if not new_cols:
            return col_map

        lost_any_lock = False

        for col in new_cols:
            async with self.col_lock(project_id, col) as won:
                if won:
                    # Re-check inside the lock — a concurrent winner on another
                    # column in the same batch may have already added this one.
                    if col not in self._col_cache.get(project_id, set()):
                        await self._ch.command(
                            f"ALTER TABLE {tbl}"
                            f" ADD COLUMN IF NOT EXISTS {col} Nullable(String)"
                        )
                        self._update_cache(project_id, col)
                        log.info(
                            "ch_column_added",
                            project_id=project_id,
                            table=tbl,
                            column=col,
                        )
                else:
                    await self.wait_for_lock_release(project_id, col)
                    lost_any_lock = True

        if lost_any_lock:
            # Re-sync our cache with whatever DDL the winner(s) committed.
            self.invalidate_cache(project_id)
            await self.get_known_columns(project_id)

        return col_map

    async def get_col_map(self, project_id: str, raw_keys: set[str]) -> dict[str, str]:
        """Return {raw_key: col_name} for every key in raw_keys, populating Redis as needed."""
        map_key = f"{_COL_MAP_PREFIX}:{project_id}"

        all_stored: dict[str, str] = await hgetall(self._redis, map_key)

        missing = raw_keys - all_stored.keys()
        if not missing:
            return {k: all_stored[k] for k in raw_keys}

        # Sanitize all missing keys and write atomically via pipeline.
        new_cols = {raw: self.sanitize_key(raw) for raw in missing}
        await pipeline_hsetnx_multi(self._redis, map_key, new_cols)

        # Re-read winners (concurrent writers may have beaten us for some keys).
        winner_values = await hmget(self._redis, map_key, missing)
        for raw, val in zip(missing, winner_values):
            all_stored[raw] = val if val else new_cols[raw]

        return {k: all_stored[k] for k in raw_keys}
