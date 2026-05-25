# ClickHouse: Per-Client Tables → Single Shared Table

## Why

Per-client tables (`pam.events_{project_id}`) don't scale:
- Each table adds memory/metadata overhead in ClickHouse — painful at 100 clients, unmanageable at 1000
- Schema migrations must run on every table separately
- Throws away ClickHouse's columnar scan and compression strengths

**Target**: one `pam.events` table, partitioned by `(project_id, toYYYYMM(event_time))`. Partition pruning means ClickHouse skips other clients' data automatically. Per-client data deletion becomes a single `DROP PARTITION` call.

The target schema already exists in `services/event-processor/migrations/0001_init.sql`.

---

## Change List

### 1. `services/event-processor/app/schema_manager.py`
Delete almost the entire file (~329 lines). All dynamic DDL logic goes away:
- `table_name()` — no longer needed
- `bootstrap_table()` — table pre-exists, no runtime CREATE
- `ensure_columns()` / `get_known_columns()` — columns are predefined
- `col_lock()` / `wait_for_lock_release()` — no more concurrent ADD COLUMN

Only `sanitize_key()` and `get_col_map()` survive if custom property columns are kept.

### 2. `services/event-processor/app/writer.py`
- Remove calls to `schema_mgr.bootstrap_table(project_id)` and `schema_mgr.ensure_columns(project_id, ...)`
- Replace `schema_mgr.table_name(project_id)` with the literal `"pam.events"`

### 3. `services/event-processor/app/main.py`
- Remove `SchemaManager` instantiation
- Remove the `schema_mgr` arg passed to `ClickHouseWriter`

### 4. `services/event-processor/app/config.py`
Remove these three settings (only used for Redis DDL locking):
- `schema_lock_ttl_seconds`
- `schema_lock_poll_ms`
- `schema_lock_timeout_seconds`

### 5. `services/segmentation-engine/app/dsl/compiler.py`
Replace `f"pam.events_{project_id}"` → `"pam.events"` in:
- `_compile_event_filter()` (~line 121)
- `_compile_did_not_do_filter()` (~lines 141, 146)

Queries already filter `WHERE project_id = ...` so no logic change needed.

### 6. `services/segmentation-engine/app/services/meta.py`
Same string replacement in:
- `_fetch_events()` (~line 79)
- `_fetch_event_properties()` (~lines 92, 95)

### 7. `services/event-processor/tests/test_schema_manager.py`
Delete the entire file (~348 lines) — all tests cover `SchemaManager` behavior that no longer exists. Replace with simpler insert-path integration tests.

### 8. `services/segmentation-engine/tests/test_dsl_compiler.py`
Update assertion:
```python
# Before
assert f"pam.events_{PROJECT_ID}" in sql
# After
assert "pam.events" in sql
```

### 9. `services/event-processor/migrations/0002_per_client_tables.sql`
Replace with a `0003_backfill.sql` that copies existing per-client data into the shared table before cutover (see below).

---

## Prerequisite: Data Backfill

Before cutting over writes, copy all existing per-client table data into `pam.events`:

```sql
-- Repeat for each existing client table
INSERT INTO pam.events
SELECT * FROM pam.events_{project_id};
```

Or write a Python script that queries `system.tables` for all `pam.events_*` tables and generates the INSERT statements dynamically.

---

## Strategy Pattern: Switchable Workflows

Rather than a hard cutover, implement both modes behind a single config flag so you can switch or rollback without a code deploy.

### Config

Add to `services/event-processor/app/config.py` and `services/segmentation-engine/app/config.py`:

```python
TABLE_STRATEGY: Literal["per_client", "shared"] = "per_client"
```

Set it via environment variable:

```bash
CLICKHOUSE_TABLE_STRATEGY=shared   # flip to enable single-table mode
CLICKHOUSE_TABLE_STRATEGY=per_client  # flip back to rollback
```

### Abstract interface

Add `services/event-processor/app/strategies/base.py`:

```python
from abc import ABC, abstractmethod

class TableStrategy(ABC):
    @abstractmethod
    async def table_name(self, project_id: str) -> str: ...

    @abstractmethod
    async def ensure_ready(self, project_id: str, keys: set[str]) -> None: ...
```

### Two implementations

`services/event-processor/app/strategies/per_client.py` — current behavior, no changes to logic:
```python
class PerClientStrategy(TableStrategy):
    async def table_name(self, project_id: str) -> str:
        return f"pam.events_{project_id}"

    async def ensure_ready(self, project_id: str, keys: set[str]) -> None:
        # existing bootstrap_table + ensure_columns logic
```

`services/event-processor/app/strategies/shared.py` — new behavior:
```python
class SharedTableStrategy(TableStrategy):
    async def table_name(self, project_id: str) -> str:
        return "pam.events"

    async def ensure_ready(self, project_id: str, keys: set[str]) -> None:
        pass  # table and columns pre-exist, nothing to do
```

### Wiring in `main.py`

```python
from app.config import settings
from app.strategies.per_client import PerClientStrategy
from app.strategies.shared import SharedTableStrategy

strategy = (
    SharedTableStrategy()
    if settings.table_strategy == "shared"
    else PerClientStrategy(redis=redis_client, ch_client=ch_client, db=db)
)
writer = ClickHouseWriter(ch_client, strategy=strategy)
```

`ClickHouseWriter` and the segmentation compiler call `strategy.table_name(project_id)` and `strategy.ensure_ready(...)` — no branching anywhere else.

### Optional: dual-write during backfill

Add a third `MigrationStrategy` that writes to both tables simultaneously during the backfill window. Once backfill is confirmed complete, switch to `shared` and retire the migration strategy.

```python
class MigrationStrategy(TableStrategy):
    async def table_name(self, project_id: str) -> str:
        return "pam.events"  # primary write target

    async def ensure_ready(self, project_id: str, keys: set[str]) -> None:
        await self._per_client.ensure_ready(project_id, keys)
        # also writes to per_client table via writer directly
```

### Cutover steps

1. Run data backfill (`0003_backfill.sql`)
2. Set `CLICKHOUSE_TABLE_STRATEGY=shared`, restart services
3. Verify writes and segmentation queries work correctly
4. Drop old `pam.events_*` tables once confident
5. Remove `PerClientStrategy` and the config flag (dead code cleanup)

---

## What Stays the Same

- `services/event-processor/app/consumer.py` — no changes
- `shared/clients/clickhouse.py` — no changes
- `shared/clients/mongo.py` — no changes
- `docs/clickhouse-schema.md` — already documents the target schema correctly
