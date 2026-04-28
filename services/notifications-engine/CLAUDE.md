# notifications-engine — Claude Code context

## One-line responsibility
Deliver notifications. Render templates, call provider APIs, track delivery.

## Inputs
- Kafka consumer on `pam.campaigns.send.v1` (group: `notif-sender`)
- HTTP webhook callbacks from providers (deliveries, bounces, opens, clicks)

## Outputs
- Provider API calls (FCM, APNs, SES, Twilio, customer webhooks)
- MongoDB `notification_deliveries` (writes), `notification_templates` (reads)
- Produces to Kafka `pam.notifications.delivery.v1`

## Hard rules

- NEVER write to ClickHouse. Delivery events go via Kafka so `event-processor` handles them.
- NEVER decide audience or apply rate limits per campaign — that's `campaign-engine`. We just deliver.
- NEVER store raw PII (email/phone). Decrypt from vault per-send only.
- ALWAYS check suppression list before sending.
- ALWAYS sign webhook payloads.
- ALWAYS use circuit breakers per provider — one bad provider must not block others.

## Key files (once built)

- `app/main.py` — consumer loop
- `app/providers/{push,email,sms,webhook}.py` — provider clients
- `app/renderer.py` — Jinja template rendering with safe context
- `app/suppression.py` — suppression list checks
- `app/callbacks.py` — provider callback HTTP handlers
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
uv run python -m app.main
```
