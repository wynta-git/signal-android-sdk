# Event Schema

The canonical contract for events flowing through PAM. Every service that touches events depends on this. **Update this doc when adding/changing an event — it is the source of truth.**

## Envelope

Every event has the same outer envelope, regardless of type:

```json
{
  "event_id": "uuid-v4",
  "event_name": "snake_case_event_name",
  "schema_version": 1,
  "project_id": "proj_abc123",
  "user_id": "user_or_anonymous_id",
  "session_id": "optional_session_id",
  "timestamp": "2026-04-27T10:00:00.000Z",
  "received_at": "2026-04-27T10:00:00.123Z",
  "sdk": { "name": "pam-web", "version": "1.0.0" },
  "device": { "platform": "web", "os": "macos", "ua": "..." },
  "properties": { /* event-specific, see below */ }
}
```

| Field | Type | Required | Set by | Notes |
|---|---|---|---|---|
| `event_id` | UUID v4 | yes | client SDK | Idempotency key. Dedupe on this. |
| `event_name` | string | yes | client SDK | Must match a registered event in `shared/models/events.py`. |
| `schema_version` | int | yes | client SDK | Envelope version, currently `1`. |
| `project_id` | string | yes | api-service | Derived from token; clients do not send. |
| `user_id` | string | yes | client SDK | Identified user id, or anonymous device id. |
| `session_id` | string | no | client SDK | Optional. |
| `timestamp` | ISO 8601 UTC | yes | client SDK | When the event happened on the client. |
| `received_at` | ISO 8601 UTC | yes | api-service | Server-side receive time. Set by api-service. |
| `sdk` | object | yes | client SDK | `{ name, version }`. |
| `device` | object | no | client SDK | Best-effort. |
| `properties` | object | depends on event | client SDK | Per-event payload. See below. |

## Validation policy

`event_name` is **not enforced at ingestion** — events with an unregistered name are accepted and flow through to ClickHouse. `api-service` logs a `warning` (`unknown_event_name`) so unknown events are observable. This ensures no event is ever dropped due to a schema gap.

Envelope fields (`event_id`, `user_id`, `timestamp`, `sdk`) are still required — an event without them cannot be keyed, ordered, or associated with a user.

## Defined events

### `app_opened`
Sent when the user opens the app/site.

| Property | Type | Required | Notes |
|---|---|---|---|
| `from_background` | bool | no | True if returning from background, false on cold start. |

### `screen_viewed`
A screen / page view.

| Property | Type | Required | Notes |
|---|---|---|---|
| `screen_name` | string | yes | Logical screen, not URL. |
| `referrer` | string | no | Previous screen name. |

### `user_identified`
Maps an anonymous id to a known user id. Published to Kafka by `api-service`; `event-processor` merges the profiles in MongoDB.

| Property | Type | Required | Notes |
|---|---|---|---|
| `previous_id` | string | yes | The anonymous id being identified. |
| `traits` | object | no | Profile traits to set (`name`, `email`, `phone`, etc.). PII fields hashed before storage. |

### `purchase_completed`
A revenue event.

| Property | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | yes | Idempotent per project. |
| `amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `USD`. |
| `items` | array | no | `[{sku, qty, price}]`. |

### `deposit_success`
A successful deposit / funding transaction.

| Property | Type | Required | Notes |
|---|---|---|---|
| `transaction_id` | string | yes | Idempotent per project. |
| `amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `USD`. |
| `payment_method` | string | no | e.g. `card`, `bank_transfer`, `crypto`. |

### `bet_placed`
Emitted by gaming/casino clients when a wager is accepted. Non-gaming clients (sports, fantasy, exchange) should use `wager` instead. Casino-specific clients may send `game_id`, `game_category`, and `game_provider`; all are optional.

| Property | Type | Required | Notes |
|---|---|---|---|
| `wager_amount` | float | yes | Stake size; 4-decimal precision. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `balance_type` | string | yes | `real`, `bonus`, or `freebet`. |
| `product_id` | string | no | Generic product/market/event reference. Casino clients use `game_id`. |
| `category` | string | no | Product vertical: `slots`, `sports`, `casino`, `crash`, etc. |
| `provider` | string | no | Content or data provider name. |
| `game_id` | string | no | Casino alias for `product_id`. |
| `game_category` | string | no | Casino alias for `category`. |
| `game_provider` | string | no | Casino alias for `provider`. |

### `wager`
General-purpose wager event for non-gaming clients (sports, fantasy, exchange, trading, etc.). Standalone — not linked to `bet_placed`. Use `bet_placed` for casino/gaming contexts and `wager` for everything else.

| Property | Type | Required | Notes |
|---|---|---|---|
| `amount` | float | yes | Stake size; 4-decimal precision. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `balance_type` | string | yes | `real`, `bonus`, or `freebet`. |
| `product_id` | string | no | Market / selection / event reference on the client platform. |
| `category` | string | no | Product vertical: `sports`, `fantasy`, `exchange`, etc. |
| `provider` | string | no | Data or platform provider name. |

### `in_app_notification_viewed`
Fired by the client the moment an in_app notification is actually rendered on screen. Also implies "read" — there's no separate mark-read user action for in_app.

| Property | Type | Required | Notes |
|---|---|---|---|
| `notification_id` | string | yes | The `notification_id` from the inbox response. |
| `campaign_id` | string | no | For attribution back to the campaign. |

### `in_app_notification_clicked`
Fired when the user taps a CTA on an in_app notification.

| Property | Type | Required | Notes |
|---|---|---|---|
| `notification_id` | string | yes | The `notification_id` from the inbox response. |
| `campaign_id` | string | no | For attribution back to the campaign. |
| `cta_label` | string | no | Which CTA button was tapped. |

### `in_app_notification_dismissed`
Fired when the user dismisses an in_app notification without acting on it.

| Property | Type | Required | Notes |
|---|---|---|---|
| `notification_id` | string | yes | The `notification_id` from the inbox response. |
| `campaign_id` | string | no | For attribution back to the campaign. |

(Add new events here, then mirror in `shared/models/events.py` — use `/add-event` to keep both in sync.)

## PII handling

These property names are treated as PII and **hashed (SHA-256 with project salt) before persistence**:

- `email`, `phone`, `name`, `first_name`, `last_name`, `address`, `ip`

Raw values may pass through `api-service` over TLS but must never be logged or written to ClickHouse / MongoDB unhashed.

## Versioning

- **Envelope version** (`schema_version`): bumped only for breaking envelope changes. Old versions supported for at least 90 days.
- **Per-event version**: not separately versioned. Adding optional properties is non-breaking. Adding a required property or changing a type is breaking — coordinate with SDK release and bump envelope version.

## Validation rules

- Unknown event names → reject with 400 at `api-service`. Do NOT silently accept.
- Unknown properties on a known event → accept and pass through (forward compatibility).
- Missing required property → reject with 400 at `api-service`; if it slips through, `event-processor` writes to DLQ.
- Timestamp more than 7 days in the past or 1 hour in the future → log warning, still accept.
