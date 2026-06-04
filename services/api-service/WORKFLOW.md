# API Service — Request Pipeline

Everything that happens between an incoming HTTP request and a Kafka publish.

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/events/track` | Ingest a batch of events |
| `POST` | `/api/v1/events/identify` | Upsert a user profile |
| `POST` | `/api/v1/events/alias` | Link two user identities |
| `GET` | `/api/v1/events/ready` | Readiness check (Redis + Kafka) |
| `*` | `/api/v1/events/admin/*` | Admin: projects, tokens, routes |

---

## Middleware Stack (applied to every request)

### 1. CORS

**[main.py:71–77](app/main.py#L71-L77)**

- Allowed origins: `settings.cors_origins` (default `["*"]`)
- Allowed methods: `POST, GET, OPTIONS`
- Allowed headers: `Authorization, Content-Type, X-Client-Id, X-Idempotency-Key`
- Exposed headers: `X-Request-Id`

### 2. Request Context Injection

**[main.py:80–90](app/main.py#L80-L90)**

Runs first on every request:
- Generates a UUID v4 `request_id`
- Reads `X-Client-Id` header
- Binds both to structlog context (all subsequent log lines carry them)
- Appends `X-Request-Id` to the response headers

### 3. Body Size Limit

**[main.py:93–101](app/main.py#L93-L101)**

- Max body size: **1 MB** (`MAX_BODY_BYTES = 1_048_576`)
- Checked via `Content-Length` header before body is read
- Exceeds limit → **400** `payload_too_large`

---

## Stage 1: Authentication

**[dependencies.py:37–81](app/dependencies.py#L37-L81) / [shared/auth/token.py](../../shared/auth/token.py)**

Every protected endpoint depends on `get_token_context`.

```
Authorization: Bearer pam_live_<random32>
    │
    ├─ Missing / malformed → 401 invalid_token
    │
    ├─ SHA-256 hash the raw token
    │   (raw token never stored or logged past this point)
    │
    ├─ Redis: check pam:token:{hash}:revoked
    │   Exists → 401 invalid_token  (emergency revocation)
    │
    ├─ Redis: check pam:token:{hash}  (5-min cache)
    │   Hit  → return cached TokenContext, skip MongoDB
    │   Miss ↓
    │
    ├─ MongoDB tokens collection: {token_hash, status: "active"}
    │   Not found → 401 invalid_token
    │   Found     → build TokenContext {project_id, scope, env}
    │
    ├─ Cache TokenContext in Redis (5-min TTL)
    │
    └─ asyncio.create_task: update tokens.last_used_at in MongoDB
        (non-blocking, failure logged but never propagated)
```

`env` is inferred from the token prefix: `pam_live_` → `"live"`, `pam_test_` → `"test"`.

### Scope Authorization

**[dependencies.py:83–95](app/dependencies.py#L83-L95)**

After auth, route dependencies enforce scopes:

| Dependency | Required scope |
|---|---|
| `EventsWriteDep` | `events:write` |
| `AdminDep` | `admin` |

`admin` scope satisfies any scope check. Missing scope → **403** `forbidden`.

---

## Stage 2: Idempotency Check

**[middleware/idempotency.py:15–33](app/middleware/idempotency.py#L15-L33)**

Optional. Triggered by `X-Idempotency-Key: <uuid-v4>` header.

- Invalid UUID → **400** `invalid_idempotency_key`
- Valid key: check Redis `pam:idempotency:{project_id}:{key}`
  - Cache hit → return stored response immediately (no further processing)
  - Cache miss → continue; store response on success (6-hour TTL)

---

## Stage 3: Rate Limiting

**[middleware/ratelimit.py:20–53](app/middleware/ratelimit.py#L20-L53)**

Two independent fixed-window counters (60-second windows, skipped if `rate_limit_enabled=False`).

### Project-level (per endpoint)

```
Key: pam:rate:proj:{project_id}:min:{epoch_minute}
Limit: 1000 req/min
```

Redis pipeline: `INCR` → `EXPIRE 60`. Counter > 1000 → **429** `rate_limited`.

### Per-user (track route only)

Called from the route handler after `user_id` is extracted from each event body.

```
Key: pam:rate:user:{project_id}:{user_id}:min:{epoch_minute}
Limit: 100 req/min
```

Exceeding this limit does **not** return HTTP 429 — the event is added to the `errors[]` array in the response (partial rejection).

---

## Stage 4: Request Validation

### `/track` — Batch Events

**[routes/track.py:22–70](app/routes/track.py#L22-L70)**

1. Parse body as `TrackRequest { events: list[Any] }`
2. Batch size > 100 → **400** `payload_too_large`
3. For each event in the batch, parse as `EventEnvelope` (Pydantic):

**Required fields:**

| Field | Type | Notes |
|---|---|---|
| `event_id` | `UUID` | Must be valid UUID |
| `event_name` | `str` | Any string accepted |
| `user_id` | `str` | Required |
| `timestamp` | `datetime` | ISO 8601 |
| `sdk.name` | `str` | Required |
| `sdk.version` | `str` | Required |

**Optional fields:** `session_id`, `device`, `properties`, `schema_version`

**Client must NOT send:** `project_id`, `received_at` — server overwrites them.

Validation failures per event → added to `errors[]` (not an HTTP error). Unknown `event_name` values are accepted with a warning log.

### `/identify`

**[routes/identify.py:18–54](app/routes/identify.py#L18-L54)**

- `user_id: str` — required
- `traits: dict[str, Any]` — fields to set
- `unset_traits: list[str]` — fields to remove
- `timestamp: datetime` — required

Conflict check: if a key appears in both `traits` and `unset_traits` → **400** `invalid_request`.

### `/alias`

**[routes/alias.py:17–20](app/routes/alias.py#L17-L20)**

- `previous_user_id: str` — required
- `user_id: str` — required

---

## Stage 5: Event Enrichment

Runs per-event, after validation passes.

### `/track`

**[routes/track.py:111–119](app/routes/track.py#L111-L119)**

Two fields are injected/overwritten by the server:

| Field | Source |
|---|---|
| `project_id` | `TokenContext.project_id` — from the auth token, never from the client |
| `received_at` | `datetime.now(timezone.utc)` — server clock at time of processing |

All other fields from the client payload pass through unchanged.

### `/alias`

**[routes/alias.py:43–52](app/routes/alias.py#L43-L52)**

A synthetic event is constructed entirely server-side:

```json
{
  "event_id": "<generated uuid>",
  "event_name": "user_alias",
  "schema_version": 1,
  "user_id": "<from request body>",
  "project_id": "<from token>",
  "timestamp": "<server clock>",
  "received_at": "<server clock>",
  "sdk": {"name": "pam-server", "version": "<settings.version>"},
  "properties": {"previous_user_id": "<from request body>"}
}
```

---

## Stage 6: Kafka Publish

**[kafka_producer.py](app/kafka_producer.py) / [routes/track.py:122–146](app/routes/track.py#L122-L146)**

### Producer config

```python
AIOKafkaProducer(
    bootstrap_servers=...,
    acks="all",               # wait for all replicas
    compression_type="gzip"
)
```

### Publish

- **Key:** `user_id.encode()` — partitions by user, preserving per-user event order
- **Value:** `json.dumps(event).encode()`
- **Topic:** `pam.events.raw.v1` (main), plus any fanout topics (see below)
- After all events sent: `flush()` waits for broker acknowledgement
- Kafka error → **503** `internal_error`

### Fanout publishing

**[routes/track.py:130–146](app/routes/track.py#L130-L146)**

After the main topic publish, events are fanned out to additional topics based on event routing rules:

1. Load inverted route map: `event_name → [topic1, topic2, ...]` (Redis-cached 5 min)
2. Group accepted events by fanout topic
3. Publish each group to its topic (separate producer per topic, created on-demand)
4. Fanout failure → **warning logged only**, not propagated to the client

### `/identify` — no Kafka

`/identify` writes directly to MongoDB `user_profiles` via `upsert_user_profile()`. No Kafka publish.

---

## Response

### `/track` — **202 Accepted**

Always returns 202 (even on partial rejection):

```json
{
  "accepted": 47,
  "rejected": 3,
  "errors": [
    {"index": 0, "event_id": null,   "code": "missing_required", "message": "Missing required field: event_id"},
    {"index": 2, "event_id": "uuid", "code": "rate_limited",     "message": "User rate limit exceeded"},
    {"index": 5, "event_id": "uuid", "code": "invalid_type",     "message": "..."}
  ]
}
```

Only events in `accepted` are published to Kafka. Rejected events are never published.

On success, if `X-Idempotency-Key` was provided, the response is cached in Redis (6-hour TTL).

---

## Error Reference

| Case | HTTP | Code |
|---|---|---|
| Missing / malformed Authorization | **401** | `invalid_token` |
| Token revoked or not found | **401** | `invalid_token` |
| Token scope insufficient | **403** | `forbidden` |
| Project rate limit exceeded | **429** | `rate_limited` |
| Body > 1 MB | **400** | `payload_too_large` |
| Batch > 100 events | **400** | `payload_too_large` |
| Missing required field (per-event) | in `errors[]` | `missing_required` |
| Invalid field type (per-event) | in `errors[]` | `invalid_type` |
| User rate limit exceeded (per-event) | in `errors[]` | `rate_limited` |
| Invalid idempotency key | **400** | `invalid_idempotency_key` |
| traits / unset_traits conflict | **400** | `invalid_request` |
| Kafka publish failed | **503** | `internal_error` |
| MongoDB upsert failed (/identify) | **503** | `internal_error` |

---

## Redis Key Reference

| Key | TTL | Purpose |
|---|---|---|
| `pam:token:{hash}` | 5 min | Cached token context |
| `pam:token:{hash}:revoked` | 1 hour | Emergency revocation flag |
| `pam:rate:proj:{project_id}:min:{epoch_min}` | 60 s | Project-level rate counter |
| `pam:rate:user:{project_id}:{user_id}:min:{epoch_min}` | 60 s | Per-user rate counter |
| `pam:event_route_map` | 5 min | Inverted fanout routing map |
| `pam:idempotency:{project_id}:{key}` | 6 hours | Cached idempotent response |

---

## Full Flow Summary

```
HTTP POST /api/v1/events/track
    │
    ├─ [Middleware] CORS headers
    ├─ [Middleware] Inject request_id, bind to log context
    ├─ [Middleware] Body size check (≤ 1 MB)
    │
    ├─ [1] Auth: hash token → Redis revoke check → Redis cache → MongoDB
    ├─ [2] Scope check: events:write
    ├─ [3] Idempotency: check Redis cache (return early if hit)
    ├─ [4] Rate limit: project-level (1000/min)
    │
    ├─ [5] Parse TrackRequest — batch size ≤ 100
    │
    └─ For each event in batch:
        ├─ [6] Validate EventEnvelope (Pydantic)
        │   Failure → add to errors[], skip
        ├─ [7] Per-user rate limit check
        │   Exceeded → add to errors[], skip
        ├─ [8] Enrich: inject project_id + received_at
        └─ Add to accepted list
    │
    ├─ [9]  Publish accepted events → Kafka pam.events.raw.v1
    │       (key = user_id, value = JSON, acks=all)
    │       Failure → 503
    │
    ├─ [10] Fanout publish to additional topics (per event routing rules)
    │       Failure → warning logged, not propagated
    │
    ├─ [11] Store idempotency response in Redis (if key provided)
    │
    └─ 202 Accepted { accepted, rejected, errors[] }
```
