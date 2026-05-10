# event-processor — Claude Code context

## One-line responsibility
Consume `pam.events.raw.v1` from Kafka, batch-write every event to ClickHouse. Owner of the `pam.events` table.

## Inputs
- Kafka topic `pam.events.raw.v1` (consumer group: `event-processor`)

## Outputs
- Writes `pam.events` in ClickHouse (batched — up to 500 events or 5 seconds, whichever comes first)
- Produces failed events to Kafka DLQ `pam.events.invalid.v1` after 3 failed retries

## Hard rules

- NEVER read or write MongoDB.
- NEVER expose HTTP endpoints.
- NEVER drop events silently — exhaust retries first, then DLQ.
- NEVER commit Kafka offsets before the ClickHouse write (or DLQ hand-off) succeeds — guarantees at-least-once delivery.
- All events are accepted regardless of `event_name` — no schema enforcement here (that policy lives in api-service).

## Key files

- `app/main.py` — entry point; wires ClickHouse client, writer, consumer; handles SIGTERM/SIGINT
- `app/consumer.py` — Kafka consumer loop: `getmany()` batching, retry-with-backoff, DLQ, offset commit
- `app/writer.py` — `ClickHouseWriter.write_batch()`; maps raw event dicts to ClickHouse rows
- `app/config.py` — all settings via env vars (`Settings` via pydantic-settings)
- `app/logging_config.py` — structlog setup (JSON in prod, console in debug)
- `migrations/0001_init.sql` — `CREATE TABLE pam.events` DDL
- `migrations/run.py` — idempotent migration runner (`python -m migrations.run`)

## Column mapping (`app/writer.py`)

`_to_row()` maps a raw event dict to the 16 insert columns:

| Source field | ClickHouse column | Notes |
|---|---|---|
| `event_id` | `event_id` UUID | String UUID passthrough |
| `event_name` | `event_name` | LowCardinality |
| `schema_version` | `schema_version` | Defaults to 1 |
| `project_id` | `project_id` | LowCardinality |
| `user_id` | `user_id` | Partition key |
| `session_id` | `session_id` | Empty string if null |
| `timestamp` | `timestamp` | Parsed from ISO string → datetime |
| `received_at` | `received_at` | Falls back to `timestamp` if absent |
| `sdk.name` | `sdk_name` | |
| `sdk.version` | `sdk_version` | |
| `device.platform` | `platform` | Empty string if absent |
| `device.os` | `os` | Empty string if absent |
| `properties.amount` | `amount` | Promoted; removed from map |
| `properties.currency` | `currency` | Promoted; removed from map |
| `properties.order_id` | `order_id` | Promoted; removed from map |
| remaining `properties` | `properties` | `Map(String, String)` — all values stringified |

`insert_date` is not inserted — ClickHouse fills it via `DEFAULT toDate(received_at)`.

## Consumer behaviour

```
getmany(timeout_ms=5000, max_records=500)
    │
    ├─ decode JSON from each message
    │   bad JSON → log warning, skip (never blocks the batch)
    │
    ├─ write_batch() → ClickHouse
    │   failure → retry up to 3× with exponential backoff (1s, 2s, 4s)
    │   still failing → send all events to DLQ
    │
    └─ consumer.commit()  ← only after write or DLQ hand-off
```

## Dependencies on `shared/`

- `shared.models.events` — `REGISTERED_EVENTS` available but not used for enforcement
- `shared.clients.kafka` — not used directly (consumer and DLQ producer are created inline)

External libraries used directly: `aiokafka`, `clickhouse-connect`.

## Reference docs

- ClickHouse schema: [`../../docs/clickhouse-schema.md`](../../docs/clickhouse-schema.md)
- Event schema + validation policy: [`../../docs/event-schema.md`](../../docs/event-schema.md)
- Kafka topics: [`../../docs/kafka-topics.md`](../../docs/kafka-topics.md)

## Local run

```bash
# First time: run migration
uv run python -m migrations.run

# Start consumer
uv run python -m app.main
```

---

## Planned feature: per-client dynamic tables

### Goal

Each client (`project_id`) gets its own ClickHouse table instead of writing to the shared `pam.events` table. Each table's columns are derived from the `properties` keys of the events that client sends — so different clients can have different schemas.

### Table naming

Table per client: `pam.events_{project_id}` (e.g. `pam.events_acme`).  
`project_id` must be sanitized to a valid ClickHouse identifier before use in DDL (see _Column name sanitization_ below).

### Dynamic column creation

When a batch arrives for a client:

1. Fetch the current column set for `pam.events_{project_id}` from `DESCRIBE TABLE` (cached in memory, refreshed on miss).
2. Diff the incoming `properties` keys against the known columns.
3. For any new key: issue `ALTER TABLE pam.events_{project_id} ADD COLUMN IF NOT EXISTS <col> Nullable(String)` before the insert.
4. Insert the batch with the now-extended schema.

All property values are stored as `Nullable(String)` initially. Promotion to a typed column (e.g. `Float64`, `Int64`) is a future concern handled by a separate schema-evolution job — not the consumer.

### Concurrency: distributed column-add lock

**Problem:** two consumer instances may receive events with the same new property key at the same time. Both would attempt `ALTER TABLE … ADD COLUMN`, creating a race. ClickHouse serializes DDL internally, so duplicate `ADD COLUMN IF NOT EXISTS` is safe at the DB level, but we still want to avoid every consumer hitting the DB with redundant DDL.

**Solution — Redis-based per-table advisory lock:**

- Key: `pam:schema_lock:{project_id}:{column_name}`, TTL 30 s.
- Consumer that wins `SET NX` → does the `ADD COLUMN`, then releases the key (or lets TTL expire).
- Losers spin-wait (poll every 100 ms, max 10 s) until the key disappears, then re-check the local column cache. By that point the DDL is committed and they can proceed to insert.
- If the winner dies mid-flight the TTL ensures losers are not blocked forever; they will retry the `ADD COLUMN IF NOT EXISTS` themselves.

This means only one consumer performs the DDL per new column, and all others wait cheaply in Redis before inserting.

### Column name sanitization

Raw `properties` keys can contain arbitrary characters from client SDKs. ClickHouse column names must be valid identifiers.

**Sanitization rules (applied at write time, not at SDK ingestion time):**

1. Convert to lowercase.
2. Replace any character that is not `[a-z0-9_]` with `_`.
3. Strip leading digits/underscores (prepend `prop_` if the result starts with a digit).
4. Truncate to 64 characters.
5. If the sanitized name collides with a reserved ClickHouse keyword, append `_col`.

**Key → column name mapping:** store the canonical mapping `{original_key: sanitized_column}` in a Redis hash `pam:col_map:{project_id}` so all consumer instances agree on the same column name for the same raw key. The first consumer to see a key writes the mapping; subsequent consumers read it.

This avoids having backtick-quoted column names in ClickHouse, which are legal but make SQL queries and downstream tooling painful.

### Table bootstrap

If `pam.events_{project_id}` does not exist when the first event arrives, the consumer creates it with the base columns (same set as `pam.events`) plus any properties columns from that first batch. Use `CREATE TABLE IF NOT EXISTS` so concurrent consumers are safe.

### Files to add / modify (implementation guide)

| File | Change |
|---|---|
| `app/schema_manager.py` | New. Owns `DESCRIBE TABLE` cache, `ADD COLUMN` logic, Redis lock, column-name sanitization, column-map Redis hash. |
| `app/writer.py` | Call `schema_manager.ensure_columns()` before each `write_batch()`. Route insert to `pam.events_{project_id}`. |
| `app/consumer.py` | Pass `project_id` through to writer per-batch (it's already in every event). |
| `app/config.py` | Add `REDIS_URL` setting (already in `CLAUDE.local.md`). |
| `migrations/0002_per_client_tables.sql` | No-op placeholder — tables are created dynamically. Document that migration runner is not needed for client tables. |

### What this does NOT change

- Kafka offset commit discipline (still commit only after write or DLQ hand-off).
- DLQ behaviour — failed events still go to `pam.events.invalid.v1`.
- `api-service` is unaffected; it still publishes to `pam.events.raw.v1`.
- The legacy `pam.events` table remains for historical data; new events go to per-client tables.
