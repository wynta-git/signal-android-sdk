# notifications-engine

Workers that consume send jobs and deliver notifications via push / email / SMS / webhook providers.

## Responsibilities

- Consume `pam.campaigns.send.v1`
- Look up recipient details (device tokens, hashed contacts → vault decrypt)
- Render templates with user/context data
- Call provider APIs with retry + circuit breaker
- Record delivery state in `notification_deliveries`
- Emit delivery status events to `pam.notifications.delivery.v1`
- Process provider callbacks (bounces, opens, clicks)

## What this service does NOT do

- Does not decide who gets messages (that's `campaign-engine`)
- Does not write to ClickHouse
- Does not expose CRUD for campaigns or templates (read-only on templates)

## Run locally

```bash
uv sync
uv run python -m app.main
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `KAFKA_BOOTSTRAP` | yes | `localhost:9092` | |
| `MONGO_URL` | yes | — | |
| `REDIS_URL` | yes | — | Suppression cache |
| `FCM_*`, `SES_*`, `TWILIO_*` | per channel | — | Provider creds |

## Test

```bash
uv run pytest
```
