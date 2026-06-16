# event-processor

Kafka consumer that reads every event from `pam.events.raw.v1` and writes it to ClickHouse. No events are rejected — all `event_name` values are accepted regardless of whether they are in the registered schema.

## Responsibilities

- Consume `pam.events.raw.v1` (group: `event-processor`)
- Batch-write events to a per-client ClickHouse table `pam.events_{project_id}` (up to 500 events or 5 seconds per flush)
- Retry failed ClickHouse writes up to 3 times with exponential backoff
- Send events that exhaust retries to the DLQ topic `pam.events.invalid.v1`
- Commit Kafka offsets only after a successful write or DLQ hand-off (at-least-once delivery)

## What this service does NOT do

- Does not validate or reject events based on `event_name`
- Does not expose HTTP endpoints
- Does not read or write MongoDB
- Does not handle segments, campaigns, or notifications

## Run locally

```bash
# Install dependencies
uv sync

# Run the ClickHouse migration (first time only)
uv run python -m migrations.run

# Start the consumer
uv run python -m app.main
```

## Environment variables

All variables map directly to `app/config.py` (`Settings`).

| Var | Default | Notes |
|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Comma-separated broker list |
| `KAFKA_EVENTS_TOPIC` | `pam.events.raw.v1` | Topic to consume |
| `KAFKA_DLQ_TOPIC` | `pam.events.invalid.v1` | Dead-letter topic |
| `KAFKA_CONSUMER_GROUP` | `event-processor` | Consumer group ID |
| `CLICKHOUSE_HOST` | `localhost` | ClickHouse host |
| `CLICKHOUSE_PORT` | `8123` | HTTP port |
| `CLICKHOUSE_DATABASE` | `pam` | Target database |
| `CLICKHOUSE_USER` | `default` | |
| `CLICKHOUSE_PASSWORD` | `` | |
| `BATCH_SIZE` | `500` | Max events per ClickHouse insert |
| `BATCH_TIMEOUT_SECONDS` | `5.0` | Max seconds to wait before flushing |
| `DEBUG` | `false` | Console logging when true |

## Migrations

```bash
uv run python -m migrations.run
```

Reads all `*.sql` files from `migrations/` in alphabetical order and runs them idempotently against ClickHouse. All DDL uses `CREATE TABLE IF NOT EXISTS`.

## Tests

```bash
uv run pytest
```

## File layout

```
app/
├── main.py           ← entry point, signal handling, ClickHouse client
├── consumer.py       ← Kafka consumer loop, retry, DLQ, offset commit
├── writer.py         ← ClickHouseWriter: row mapping + batch insert
├── config.py         ← Settings (pydantic-settings, env-driven)
└── logging_config.py ← structlog setup

migrations/
└── run.py            ← migration runner (client tables are created dynamically by SchemaManager)
```
