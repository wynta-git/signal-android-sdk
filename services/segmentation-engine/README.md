# segmentation-engine

Compiles segment DSL into queries, evaluates against ClickHouse + MongoDB, persists segment memberships.

## Responsibilities

- CRUD for segment definitions (HTTP API for internal admin UI)
- Compile DSL to ClickHouse SQL / MongoDB queries
- Compute and persist segment memberships in MongoDB
- Re-evaluate on schedule (cron) and on relevant events (Kafka consumer)
- Maintain a hot-cache of memberships in Redis

## What this service does NOT do

- Does not write to ClickHouse (read-only on `pam.events`)
- Does not handle campaigns or notifications
- Does not authenticate end-user traffic (admin-only API, internal mTLS)

## Run locally

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8003
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `KAFKA_BOOTSTRAP` | yes | `localhost:9092` | |
| `CLICKHOUSE_URL` | yes | — | |
| `MONGO_URL` | yes | — | |
| `REDIS_URL` | yes | — | Membership cache |

## Test

```bash
uv run pytest
```
