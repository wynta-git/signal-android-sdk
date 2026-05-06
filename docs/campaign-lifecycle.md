# Campaign Lifecycle

How a campaign moves from idea to delivered notification.

## States

```
draft → scheduled → running → completed
                        ↓
                     paused → running
                        ↓
                    cancelled
```

| State | Meaning |
|---|---|
| `draft` | Being authored. Not active, no sends. |
| `scheduled` | Validated, awaiting trigger time or trigger event. |
| `running` | Currently sending. For event-triggered, this is the steady state. |
| `paused` | Halted by operator. No new sends. Resume → `running`. |
| `completed` | Finished (one-off campaign reached its end, scheduled campaign past its end date). |
| `cancelled` | Stopped permanently. |

## Trigger types

### Event-triggered
Sends to a user when they do a specific event matching constraints, optionally filtered by audience segment.

```json
{
  "trigger": { "type": "event", "event_name": "cart_abandoned" },
  "audience": { "segment_id": "seg_active_buyers" },
  "delay": { "minutes": 30 },
  "channel": "push",
  "template_id": "tmpl_cart_recovery"
}
```

Flow:
1. `campaign-engine` consumes `pam.events.raw.v1`.
2. Filters events by `event_name`.
3. Checks user is in `audience.segment_id` (Redis cache → MongoDB fallback).
4. Applies `delay` (delayed-send queue or Kafka with delivery_at header).
5. Emits send job to `pam.campaigns.send.v1`.

### Scheduled
Sends to all users in the audience at a specific time.

```json
{
  "trigger": { "type": "scheduled", "cron": "0 9 * * MON" },
  "audience": { "segment_id": "seg_pro_users" },
  "channel": "email",
  "template_id": "tmpl_weekly_digest"
}
```

Flow:
1. Cron runner inside `campaign-engine` fires.
2. Reads segment membership for the audience.
3. Emits send jobs in batches to `pam.campaigns.send.v1`.

### One-off
Single blast to an audience, fired immediately or at a specific timestamp.

```json
{
  "trigger": { "type": "one_off", "send_at": "2026-04-30T10:00:00Z" }
}
```

## Rate limiting per user

```json
"rate_limit": { "per_user_per_day": 1, "per_user_per_campaign_total": 1 }
```

Enforced before emitting send job:
- Check `pam:campaign:sent:{campaign_id}:{user_id}` in Redis.
- Skip if already-sent within window.

## Send job (Kafka payload)

Topic: `pam.campaigns.send.v1`. Key: `user_id`.

```json
{
  "send_id": "uuid",
  "project_id": "proj_abc123",
  "campaign_id": "camp_xyz",
  "campaign_run_id": "run_123",
  "user_id": "user_42",
  "channel": "push",
  "template_id": "tmpl_cart_recovery",
  "context": {
    "event_id": "evt_that_triggered",
    "event_properties": { "cart_value": 49.99 }
  },
  "deliver_at": "2026-04-27T10:30:00Z"
}
```

## Delivery tracking

`notifications-engine` writes to `notification_deliveries`:

- `queued` → `sent` | `failed` (provider responded)
- `sent` → `delivered` | `bounced` (provider callback)
- `delivered` → `opened` → `clicked` (user interaction)

Each transition also emits to `pam.notifications.delivery.v1` so it appears in analytics and can drive follow-up campaigns ("users who didn't open campaign X within 24h").

## Failure handling

- Provider 5xx / rate limit: retry with exponential backoff (max 5 attempts, 30 min cap).
- Provider 4xx: mark `failed`, do not retry.
- User opted out: skip and mark `suppressed`.
- Template render error: mark `failed`, alert.

## Don'ts

- Do not send the same campaign to the same user twice unless rate limit explicitly allows.
- Do not block event ingestion on campaign processing — campaign-engine is a separate consumer group.
- Do not call provider APIs from `api-service` or `event-processor`.
