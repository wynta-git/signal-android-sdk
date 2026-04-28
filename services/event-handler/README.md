# event-handler

Receives events from `api-service`, normalizes them, and publishes to Kafka.

## Responsibilities

- Add server-side metadata (`received_at`, server identifiers)
- Look up `project_id` enrichments needed downstream
- Resolve `anonymous_id` → `user_id` mappings
- Publish to `pam.events.raw.v1` with `user_id` as partition key

## What this service does NOT do

- Does not authenticate (already done at `api-service`)
- Does not validate event semantics (that's `event-processor`)
- Does not write to ClickHouse

## Run locally

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8002
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `KAFKA_BOOTSTRAP` | yes | `localhost:9092` | |
| `MONGO_URL` | yes | — | `users`, `anonymous_to_user` |
| `LOG_LEVEL` | no | `INFO` | |

## Test

```bash
uv run pytest
```
