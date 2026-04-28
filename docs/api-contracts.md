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
Map an anonymous id to a known user id and set traits.

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
  "timestamp": "2026-04-27T10:00:00.000Z"
}
```

**Response 202**
```json
{ "user_id": "user_42" }
```

PII fields (`email`, `phone`, etc.) are hashed before persistence — see [`event-schema.md`](event-schema.md#pii-handling).

### `POST /v1/alias`
Merge two user ids (e.g. login flows that bridge two known users).

**Request**
```json
{
  "previous_user_id": "user_42",
  "user_id": "user_42_canonical"
}
```

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

## SDK retry policy (recommended)

- 5xx and 429: exponential backoff with jitter, capped at 5 retries.
- 4xx (other than 429): do not retry; report to caller.
- Persist unsent events on disk where possible.

## Versioning

- URL path version (`/v1`).
- Bump major (`/v2`) only for breaking request/response changes.
- Run `/v1` and `/v2` in parallel for at least 6 months on bumps.
