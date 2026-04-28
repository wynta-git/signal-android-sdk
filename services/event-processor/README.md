# event-processor

Kafka consumer that validates events and writes them to ClickHouse.

## Responsibilities

- Consume `pam.events.raw.v1`
- Validate each event against the registered schema (`shared.models.events`)
- Write valid events to ClickHouse `pam.events` in batches
- Send invalid events to DLQ topic `pam.events.invalid.v1`
- Run ClickHouse migrations on startup

## What this service does NOT do

- Does not expose HTTP endpoints (other than health/metrics)
- Does not read or write MongoDB
- Does not handle segments, campaigns, or notifications

## Run locally

```bash
uv sync
uv run python -m app.main
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `KAFKA_BOOTSTRAP` | yes | `localhost:9092` | |
| `KAFKA_GROUP_ID` | no | `event-processor-main` | |
| `CLICKHOUSE_URL` | yes | — | |
| `BATCH_SIZE` | no | `1000` | Events per ClickHouse insert |
| `BATCH_INTERVAL_MS` | no | `1000` | Max wait before flushing |

## Test

```bash
uv run pytest
```

## Migrations

```bash
uv run python -m migrations.run
```
