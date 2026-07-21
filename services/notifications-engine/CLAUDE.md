# notifications-engine — Claude Code context

## One-line responsibility
Deliver notifications. Render templates, call provider APIs, track delivery.

## Inputs
- Kafka consumer on `pam.campaigns.send.v1` (group: `notif-sender`) — push, in_app,
  and single-recipient (event-triggered) email
- Kafka consumer on `pam.campaigns.send.grouped.email.v1` (group:
  `notif-sender-grouped-email`) — grouped (segment/scheduled) email, produced by
  scheduler-service's `run_campaign_grouped`
- HTTP webhook callbacks from providers (deliveries, bounces, opens, clicks)

## Outputs
- Provider API calls (FCM, APNs, SES, Twilio, customer webhooks)
- MongoDB `notification_deliveries` (writes), `notification_templates` (reads)
- Produces to Kafka `pam.notifications.delivery.v1`

## Hard rules

- NEVER write to ClickHouse. Delivery events go via Kafka so `event-processor` handles them.
- NEVER decide audience or apply rate limits per campaign — that's `campaign-engine`. We just deliver.
- NEVER store raw phone numbers. Decrypt from vault per-send only.
- Email addresses ARE stored in plaintext in `users.traits.email` (no vault) — an
  explicit, approved exception to the PII-vault policy for the email channel only.
  See `docs/notifications-channels.md` for rationale.
- ALWAYS check suppression list before sending.
- ALWAYS sign webhook payloads.
- ALWAYS use circuit breakers per provider — one bad provider must not block others.

## Key files

- `app/main.py` — FastAPI app + lifespan; starts both the push/in_app consumer
  and the grouped-email consumer as background tasks, serves `/health` and the
  `/v1/email/*` routes
- `app/consumer.py` — push/in_app/single-recipient-email consumer (topic
  `pam.campaigns.send.v1`)
- `app/grouped_email_consumer.py` — grouped-email consumer, its own topic
  (`pam.campaigns.send.grouped.email.v1`), consumer group, and fetch-batch
  tuning, completely independent of `app/consumer.py`
- `app/providers/push.py` — FCM/APNs provider client
- `app/providers/email.py` — email provider **registry** (resolves which vendor adapter
  a brand/project uses; not vendor-specific itself — see `app/providers/base.py`'s
  `EmailProvider` contract)
- `app/providers/sendgrid.py` — SendGrid adapter (fully implemented)
- `app/providers/mailgun.py` — Mailgun adapter (registry-wired, `send_batch()` intentionally raises `NotImplementedError`)
- `app/renderer.py` — Jinja template rendering with safe context; email's
  `render_email_shared`/`build_email_substitutions` split shared-template
  rendering from per-recipient SendGrid substitution tokens
- `app/suppression.py` — channel-scoped suppression checks
- `app/unsubscribe.py` — one-click unsubscribe link signing + verification
- `app/callbacks.py` — SendGrid Event Webhook (bounces/complaints) + unsubscribe route
- `app/circuit_breaker.py` — per-provider breaker

## Dependencies on `shared/`

- `shared.kafka.consumer`, `shared.kafka.producer`
- `shared.clients.mongo`, `shared.clients.redis`

## Reference docs

- Channels: [`../../docs/notifications-channels.md`](../../docs/notifications-channels.md)
- Campaign lifecycle: [`../../docs/campaign-lifecycle.md`](../../docs/campaign-lifecycle.md)
- Kafka topics: [`../../docs/kafka-topics.md`](../../docs/kafka-topics.md)

## Local run

```bash
uv run uvicorn app.main:app --port 8005
```
