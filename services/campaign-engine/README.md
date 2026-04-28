# campaign-engine

Owns campaign definitions, lifecycle, and triggering. Decides who gets sent what, and when.

## Responsibilities

- CRUD for campaigns (internal admin API)
- Listen to `pam.events.raw.v1` for event-triggered campaigns
- Run cron for scheduled campaigns
- Resolve audience (segment_id → user list) via `segment-engine` cache + MongoDB
- Apply rate limits (per-user-per-campaign, per-user-per-day)
- Emit send jobs to `pam.campaigns.send.v1`

## What this service does NOT do

- Does not call notification providers (that's `notifications-engine`)
- Does not compute segment memberships (that's `segmentation-engine`)
- Does not write to ClickHouse

## Run locally

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8004
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `KAFKA_BOOTSTRAP` | yes | `localhost:9092` | |
| `MONGO_URL` | yes | — | |
| `REDIS_URL` | yes | — | Rate limit + membership cache |

## Test

```bash
uv run pytest
```
