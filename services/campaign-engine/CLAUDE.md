# campaign-engine — Claude Code context

## One-line responsibility
Owns campaigns. Decides who gets sent what, when. Emits send jobs.

## Inputs
- HTTP (internal admin API) — CRUD for campaigns
- Kafka consumer on `pam.events.raw.v1` (group: `campaign-trigger`)
- Cron — scheduled campaigns

## Outputs
- Produces to Kafka `pam.campaigns.send.v1`
- MongoDB `campaigns`, `campaign_runs`, `notification_templates` (writes)
- Redis `pam:seg:{project_id}:{segment_id}:members` (reads only — membership check via SISMEMBER)

## Hard rules

- NEVER call notification providers (FCM/SES/Twilio/etc.). Emit a send job; let `notifications-engine` deliver.
- NEVER write to ClickHouse.
- NEVER write to `segments` or `segment_memberships` — read only.
- ALWAYS check rate limit before emitting send job.
- ALWAYS scope by `project_id`.

## Key files (once built)

- `app/main.py` — FastAPI admin API
- `app/triggers/event.py` — Kafka-driven trigger
- `app/triggers/scheduled.py` — cron-driven trigger
- `app/audience.py` — segment resolution + Redis cache
- `app/rate_limit.py` — per-user-per-campaign throttling
- `app/sender.py` — emits to `pam.campaigns.send.v1`

## Dependencies on `shared/`

- `shared.kafka.consumer`, `shared.kafka.producer`
- `shared.clients.mongo`, `shared.clients.redis`

## Reference docs

- Campaign lifecycle: [`../../docs/campaign-lifecycle.md`](../../docs/campaign-lifecycle.md)
- Kafka topics: [`../../docs/kafka-topics.md`](../../docs/kafka-topics.md)
- MongoDB schema: [`../../docs/mongodb-collections.md`](../../docs/mongodb-collections.md)

## Local run

```bash
uv run uvicorn app.main:app --reload --port 8004
```
