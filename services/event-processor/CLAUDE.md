# event-processor — Claude Code context

## One-line responsibility
Consume `pam.events.raw.v1` from Kafka, batch-write every event to a per-client ClickHouse table `pam.events_{project_id}`.

## Inputs
- Kafka topic `pam.events.raw.v1` (consumer group: `event-processor`)

## Outputs
- Writes `pam.events_{project_id}` in ClickHouse (batched — up to 500 events or 5 seconds, whichever comes first). Table is created automatically on the first event for each project.
- Produces failed events to Kafka DLQ `pam.events.invalid.v1` after 3 failed retries

## Hard rules

- NEVER expose HTTP endpoints.
- NEVER drop events silently — exhaust retries first, then DLQ.
- NEVER commit Kafka offsets before the ClickHouse write (or DLQ hand-off) succeeds — guarantees at-least-once delivery.
- All events are accepted regardless of `event_name` — no schema enforcement here (that policy lives in api-service).

## Key files

- `app/main.py` — entry point; wires ClickHouse client, writer, consumer; handles SIGTERM/SIGINT
- `app/consumer.py` — Kafka consumer loop: `getmany()` batching, retry-with-backoff, DLQ, offset commit
- `app/writer.py` — `ClickHouseWriter.write_batch()`; maps raw event dicts to ClickHouse rows
- `app/schema_manager.py` — `SchemaManager`: per-client table bootstrap, dynamic column DDL, Redis lock, column name sanitization
- `app/config.py` — all settings via env vars (`Settings` via pydantic-settings)
- `app/logging_config.py` — structlog setup (JSON in prod, console in debug)
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
| `properties.order_id` | `order_id` | Promoted; removed from dynamic columns |
| remaining `properties` | `<key>` (Nullable String) | Each key becomes its own column added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` |

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

## Per-client tables

Each project gets its own ClickHouse table `pam.events_{project_id}` (e.g. `pam.events_proj_demo`). Tables are created automatically by `SchemaManager.bootstrap_table()` on the first event for each project. New `properties` keys become `Nullable(String)` columns via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` with a Redis distributed lock to prevent concurrent DDL races.

Column name sanitization (in `SchemaManager.sanitize_key()`): lowercase, non-alphanumeric → `_`, strip leading `_`, truncate at 64 chars, append `_col` if reserved keyword. The raw→sanitized mapping is stored in Redis (`pam:col_map:{project_id}`) and MongoDB for durability across Redis flushes.
