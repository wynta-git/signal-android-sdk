# Public API Contracts

The HTTP API exposed by `api-service` to client SDKs. **This is a public contract — breaking changes require an API version bump.**

Base URL: `https://api.pam.example/v1`

## Authentication

All requests must include:

```
Authorization: Bearer <project_token>
```

Token format and validation: see [`auth.md`](auth.md).

## Endpoints

### `POST /v1/track`
Record one or more events.

**Request**
```json
{
  "events": [
    {
      "event_id": "uuid-v4",
      "event_name": "screen_viewed",
      "schema_version": 1,
      "user_id": "user_42",
      "session_id": "sess_abc",
      "timestamp": "2026-04-27T10:00:00.000Z",
      "sdk": { "name": "pam-web", "version": "1.0.0" },
      "device": { "platform": "web", "os": "macos" },
      "properties": { "screen_name": "home" }
    }
  ]
}
```

**Response 202** — accepted for async processing
```json
{ "accepted": 1, "rejected": 0, "errors": [] }
```

**Response 400** — partial or full rejection
```json
{
  "accepted": 0,
  "rejected": 1,
  "errors": [
    { "index": 0, "event_id": "...", "code": "unknown_event", "message": "..." }
  ]
}
```

**Response 401 / 403 / 429** — auth / rate limit failures

Limits:
- Up to 100 events per request.
- Per-project rate limits enforced (see [`redis-usage.md`](redis-usage.md)).
- Body size limit 1MB.

### `POST /v1/identify`
Upsert a player profile into MongoDB. Merges traits into the existing document;
`first_seen_at` is set only on first insert, `last_seen_at` is updated every call.

**Request**
```json
{
  "user_id": "user_42",
  "anonymous_id": "anon_xxx",
  "traits": {
    "email": "asha@example.com",
    "phone": "+91...",
    "name": "Asha",
    "plan": "pro"
  },
  "unset_traits": ["country"],
  "timestamp": "2026-04-27T10:00:00.000Z"
}
```

- `traits` — merged into the profile; existing keys not present here are left untouched.
- `unset_traits` — list of trait keys to explicitly remove from the profile.
- A key cannot appear in both `traits` and `unset_traits` — returns 400 if so.
- `email` and `phone` are hashed (SHA-256) and stored as `email_hash` / `phone_hash` — raw PII is never persisted.

**Response 202**
```json
{ "user_id": "user_42" }
```

### `POST /v1/alias`
Merge two user ids (e.g. login flows that bridge two known users).

**Request**
```json
{
  "previous_user_id": "user_42",
  "user_id": "user_42_canonical"
}
```

### `GET /v1/notifications/inbox`
Fetch pending in_app notifications for a user. Mounted in code at `/api/v1/notifications/inbox` (separate prefix from the `/api/v1/events/...` ingestion routes above, since this is a read/update surface, not event ingestion).

**Query params**: `user_id` (required), `unread_only` (bool, default `false`), `cursor` (opaque, from a previous response), `limit` (default 20, max 100).

**Response 200**
```json
{
  "notifications": [
    {
      "notification_id": "notif_abc123",
      "campaign_id": "camp_789",
      "variant_id": "var_a",
      "template_type": "modal",
      "render_engine": "native",
      "trigger_type": "on_session_start",
      "title": "Claim your welcome bonus!",
      "body": "...",
      "media": { "image_url": "...", "background_color": "#fff", "background_opacity": "opaque" },
      "cta": [{ "role": "primary", "label": "Claim Now", "action": "deep_link", "value": "wynta://promo" }],
      "close_button_visibility": "always",
      "layout": null,
      "web_view_url": null,
      "created_at": "2026-07-13T10:00:00.000Z",
      "expires_at": null,
      "read": false
    }
  ],
  "next_cursor": "opaque_token_or_null",
  "unread_count": 5
}
```

Full field reference: [`in-app-notifications-explained.md`](in-app-notifications-explained.md).

### `GET /v1/notifications/unread-count`
**Query params**: `user_id` (required).
**Response 200**: `{ "unread_count": 5 }`

### `POST /v1/notifications/read`
**Query params**: `user_id` (required).
**Request**: exactly one of `{ "notification_ids": ["notif_abc123"] }` or `{ "mark_all": true }`.
**Response 200**: `{ "updated": 2 }`

### `DELETE /v1/notifications/{notification_id}`
**Query params**: `user_id` (required).
**Response 204** — no body. **404** `notification_not_found` if missing or not owned by this user.

### `GET /v1/health`
Liveness. No auth required.

```json
{ "status": "ok", "version": "0.1.0" }
```

### `GET /v1/ready`
Readiness — checks Kafka producer health. No auth required.

## Error codes

| Code | Meaning |
|---|---|
| `unknown_event` | `event_name` not registered. |
| `missing_required` | Required envelope or property field missing. |
| `invalid_type` | Property has wrong type. |
| `payload_too_large` | Body > 1MB or > 100 events. |
| `rate_limited` | Project or user rate limit hit. |
| `invalid_token` | Token missing, malformed, expired, or revoked. |
| `forbidden` | Token lacks required scope. |
| `internal_error` | Server-side. Retry with backoff. |
| `notification_not_found` | `notification_id` doesn't exist or doesn't belong to this user. |
| `invalid_cursor` | Pagination cursor malformed or expired. |

## SDK retry policy (recommended)

- 5xx and 429: exponential backoff with jitter, capped at 5 retries.
- 4xx (other than 429): do not retry; report to caller.
- Persist unsent events on disk where possible.

## Versioning

- URL path version (`/v1`).
- Bump major (`/v2`) only for breaking request/response changes.
- Run `/v1` and `/v2` in parallel for at least 6 months on bumps.
