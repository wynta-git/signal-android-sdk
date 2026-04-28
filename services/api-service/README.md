# api-service

Public-facing ingestion API. Single entry point for all client SDK traffic.

## Responsibilities

- Authenticate requests (project token validation)
- Enforce per-project rate limits (Redis)
- Validate event envelope shape
- Forward valid events to `event-handler`
- Serve health/readiness probes

## What this service does NOT do

- Does not write to Kafka directly (that's `event-handler`)
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
| `EVENT_HANDLER_URL` | yes | `http://localhost:8002` | Internal forwarding target |
| `LOG_LEVEL` | no | `INFO` | |

## Test

```bash
uv run pytest
```

## Endpoints

See [`../../docs/api-contracts.md`](../../docs/api-contracts.md).
