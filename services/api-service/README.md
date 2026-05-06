# api-service

Public-facing ingestion API. Single entry point for all client SDK traffic.

## Responsibilities

- Authenticate requests (project token validation)
- Enforce per-project rate limits (Redis)
- Validate event envelope shape
- Publish validated events directly to Kafka (`pam.events.raw.v1`)
- Serve health/readiness probes

## What this service does NOT do

- Does not write to ClickHouse (that's `event-processor`)
- Does not handle business logic for segments or campaigns
- Does not call notification providers

## Run locally

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8001
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `MONGO_URL` | yes | — | For `tokens`, `projects` |
| `REDIS_URL` | yes | — | Token cache, rate limit counters |
| `KAFKA_BOOTSTRAP_SERVERS` | yes | `localhost:9092` | Kafka broker(s) |
| `KAFKA_EVENTS_TOPIC` | no | `pam.events.raw.v1` | Topic for ingested events |
| `LOG_LEVEL` | no | `INFO` | |

## Test

```bash
uv run pytest
```

## Endpoints

See [`../../docs/api-contracts.md`](../../docs/api-contracts.md).
