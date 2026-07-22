# scheduler-service — Claude Code context

## One-line responsibility
Polls MongoDB for due campaigns, atomically locks them, and executes fan-out to segment members.

## Replaces
APScheduler from `campaign-engine`. campaign-engine now only owns CRUD/state routes.

## Inputs
- MongoDB `campaigns` collection (polls every 1 s via `asyncio.sleep`)
- Kafka `pam.campaigns.schedule.v1` (executor consumer group)

## Outputs
- Kafka `pam.campaigns.send.v1` (per-user send jobs → notifications-engine) — push, in_app
- Kafka `pam.campaigns.send.grouped.email.v1` (grouped send jobs, many user_ids per
  message → notifications-engine) — email, and future sms/whatsapp/telegram
- Kafka `pam.campaigns.schedule.dlq.v1` (failed campaigns after MAX_RETRY_COUNT)
- MongoDB `campaigns` (updates picked, next_run_at, status, retry_count)
- MongoDB `campaign_runs` (inserts and updates)

## Grouped fan-out (email, and future batchable channels)

`app/sender.py` has two fan-out functions: `run_campaign()` (unchanged, push/in_app —
one `SendJob` per user) and `run_campaign_grouped()` (email/sms/whatsapp/telegram —
same audience/rate-limit checks per user, but accumulates passing user_ids and emits
one `GroupedSendJob` per batch instead). `app/executor.py`'s `handle_execution()` picks
which one to call based on `campaign["channel"]`. Grouping happens here, upstream of
Kafka, specifically so batch quality is independent of unrelated concurrent campaign
traffic elsewhere on the platform — see `docs/notifications-channels.md` for the full
rationale. **NEVER fetch user profile data or do template rendering here** —
`run_campaign_grouped` only ever accumulates and emits bare `user_id`s; personalization
happens entirely in notifications-engine.

Batch size per channel is `batch_size_{email,sms,whatsapp}` in `app/config.py` (falls
back to `batch_size_default`), overridable per-project via
`projects.settings.batch_size_overrides` in MongoDB.

## Three async loops (all run in every pod)

| Loop | File | Interval | Purpose |
|------|------|----------|---------|
| Poller | `poller.py` | 1 s (asyncio.sleep) | Lock due campaigns, publish ExecutionEvent |
| Recovery | `recovery.py` | 60 s | Reset picked=true campaigns with no completed run after timeout |
| Executor | `executor.py` | Kafka consumer | Execute campaigns, emit send jobs |

## Hard rules

- NEVER use APScheduler or in-memory timers. Only `asyncio.sleep`.
- NEVER write segments or user profiles — read only via Redis.
- ALWAYS re-read campaign status from MongoDB before execution (cancel-after-publish safety).
- ALWAYS check existing CampaignRun by run_id before executing (Kafka redelivery idempotency).
- NEVER commit Kafka offset on failure — let it redeliver.
- After MAX_RETRY_COUNT failures, route to DLQ and reset picked=false.

## Key env vars

```
MONGO_URL, MONGO_DATABASE
KAFKA_BOOTSTRAP_SERVERS
KAFKA_SCHEDULER_TOPIC=pam.campaigns.schedule.v1
KAFKA_DLQ_TOPIC=pam.campaigns.schedule.dlq.v1
KAFKA_SEND_TOPIC=pam.campaigns.send.v1
KAFKA_CONSUMER_GROUP=scheduler-service
REDIS_URL
POLL_INTERVAL_SECONDS=1
STALE_LOCK_TIMEOUT_SECONDS=300
MAX_RETRY_COUNT=3
```

## Local run

```bash
cd services/scheduler-service && uv run python -m app.main
```
