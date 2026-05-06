# api-service — Feature Reference

Complete description of every feature implemented in this service, including request/response contracts, internal flows, and design decisions.

---

## Table of Contents

1. [Application Bootstrap](#1-application-bootstrap)
2. [Token Authentication](#2-token-authentication)
3. [Rate Limiting](#3-rate-limiting)
4. [POST /v1/track](#4-post-v1track)
5. [POST /v1/identify](#5-post-v1identify)
6. [POST /v1/alias](#6-post-v1alias)
7. [GET /v1/health](#7-get-v1health)
8. [GET /v1/ready](#8-get-v1ready)
9. [Kafka Event Producer](#9-kafka-event-producer)
10. [Global Middleware](#10-global-middleware)

---

## 1. Application Bootstrap

**File:** `app/main.py`

On startup the app initialises three shared resources and stores them on `app.state` for the lifetime of the process:

| Resource | `app.state` key | Purpose |
|---|---|---|
| Motor MongoDB client | `mongo` | Token lookups, project config |
| Redis client | `redis` | Token cache, rate limit counters |
| KafkaEventProducer | `producer` | aiokafka producer for event publishing |

On shutdown all three are cleanly closed in the `lifespan` context manager.

```
Process start
    │
    ├─ make_mongo_client(url, pool_size)  → app.state.mongo
    ├─ make_redis_client(url, max_conns)  → app.state.redis
    └─ KafkaEventProducer(bootstrap)      → app.state.producer
    │
    ▼
Serve requests
    │
    ▼
Process shutdown
    ├─ mongo.close()
    ├─ redis.aclose()
    └─ producer.stop()
```

**Config** (`app/config.py`, all overridable via env vars):

| Variable | Default | Description |
|---|---|---|
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB` | `pam` | Database name |
| `MONGO_MIN_POOL_SIZE` | `5` | Min Motor connection pool |
| `MONGO_MAX_POOL_SIZE` | `50` | Max Motor connection pool |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `REDIS_MAX_CONNECTIONS` | `20` | Redis connection pool size |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Kafka broker(s) |
| `KAFKA_EVENTS_TOPIC` | `pam.events.raw.v1` | Topic for all ingested events |
| `DEBUG` | `false` | Enables `/docs`, console logging |
| `VERSION` | `0.1.0` | Reported in health/ready responses |

---

## 2. Token Authentication

**Files:** `app/auth/token.py`, `app/dependencies.py`

PAM uses **opaque tokens** — not JWTs. A token (`pam_live_abc123...`) carries no information by itself; meaning is derived from a server-side lookup.

### Why opaque tokens, not JWT?

| Concern | JWT | Opaque token |
|---|---|---|
| Revocation | Needs a blocklist — can't revoke without one | Flip `status: revoked` in MongoDB — instant |
| Scope changes | Baked into token at issuance — must reissue | Updated in DB — live immediately |
| `project_id` trust | Client could forge payload | Always derived server-side — client has no say |
| Metadata exposure | Decoded by anyone | Token is meaningless without the DB |

### Token format

```
pam_<env>_<random32>

pam_live_a7Hk3mP9xQr2...   ← production data → database "pam"
pam_test_zP0r2bNk9mXq...   ← test data → database "pam_test"
```

Tokens are generated once (on project setup), shown to the user once in plaintext, and never stored raw. Only `SHA-256(token)` is stored in MongoDB.

### Validation flow

```
Authorization: Bearer pam_live_a7Hk3...
    │
    ▼
SHA-256 hash → token_hash
    │
    ├─→ Redis EXISTS pam:token:<hash>:revoked
    │       yes → raise InvalidTokenError → 401
    │
    ├─→ Redis GET pam:token:<hash>
    │       hit → deserialise → TokenContext (no DB call)
    │
    └─→ MongoDB tokens.find_one({token_hash, status:"active"})
            not found → raise InvalidTokenError → 401
            found →
                TokenContext(project_id, scope, env)
                Redis SET pam:token:<hash>  TTL=300s
                create_task(update last_used_at)  ← non-blocking audit
                → TokenContext
```

### TokenContext

```python
@dataclass(frozen=True)
class TokenContext:
    project_id: str               # always from DB, never from request body
    scope: list[str]              # e.g. ["events:write"]
    env: Literal["live", "test"]  # derived from token prefix
```

`has_scope("events:write")` returns `True` if the scope is present **or** if the token has `"admin"` scope.

### FastAPI wiring

```python
# dependencies.py

get_token_context   → extracts Bearer token, calls validate_token, returns TokenContext
RequireScope(scope) → depends on get_token_context, raises 403 if scope missing

# Pre-built aliases:
EventsWriteDep = Annotated[TokenContext, Depends(RequireScope("events:write"))]
AdminDep       = Annotated[TokenContext, Depends(RequireScope("admin"))]
RateLimitedDep = Annotated[TokenContext, Depends(project_rate_limit)]
```

After successful auth, `project_id` and `env` are bound into structlog context vars — every log line in that request automatically carries them.

### Error responses

| Condition | Status | Code |
|---|---|---|
| Missing `Authorization` header | 401 | `invalid_token` |
| Token not found or revoked | 401 | `invalid_token` |
| Token found but scope insufficient | 403 | `forbidden` |

Both "not found" and "revoked" return the same 401 — callers cannot distinguish them.

---

## 3. Rate Limiting

**File:** `app/middleware/ratelimit.py`

Runs **after** auth (needs `project_id`) and **before** business logic.

### Two levels

| Level | Redis key | Default limit | Checked by |
|---|---|---|---|
| Project | `pam:rate:proj:{project_id}:min:{epoch_min}` | 1 000 req/min | `project_rate_limit` dependency |
| User | `pam:rate:user:{project_id}:{user_id}:min:{epoch_min}` | 100 req/min | `user_rate_limit()` utility in route handlers |

### Fixed-window counter

```
Request arrives for proj_abc
    │
    ▼
Redis pipeline (single roundtrip):
    INCR  pam:rate:proj:proj_abc:min:1234567  → count
    EXPIRE pam:rate:proj:proj_abc:min:1234567   60s
    │
    ├─ count ≤ 1000 → pass
    └─ count > 1000 → 429 { code: "rate_limited" }
```

`INCR + EXPIRE` are sent as a pipeline so the key always gets a TTL — avoids the stale-key edge case if the process crashes between the two calls.

### Error response

```json
HTTP 429
{ "code": "rate_limited", "message": "Too many requests" }
```

---

## 4. POST /v1/track

**File:** `app/routes/track.py`

Core ingestion endpoint. Accepts a batch of analytics events, validates each one, and publishes accepted events to Kafka.

### Request

```
POST /v1/track
Authorization: Bearer pam_live_...
Content-Type: application/json

{
  "events": [
    {
      "event_id": "uuid-v4",           ← idempotency key, client-generated
      "event_name": "screen_viewed",   ← must be a registered event
      "user_id": "user_42",
      "timestamp": "2026-05-01T10:00:00Z",
      "sdk": { "name": "pam-web", "version": "1.0.0" },
      "device": { "platform": "web", "os": "macos" },  ← optional
      "properties": { "screen_name": "home" }
    }
  ]
}
```

Limits: max **100 events per request**, max **1MB body**.

### Response 202

```json
{ "accepted": 2, "rejected": 1, "errors": [
    { "index": 2, "event_id": "...", "code": "unknown_event", "message": "..." }
]}
```

### Full flow

```
POST /v1/track
    │
    ├─ body_size_limit middleware  → 400 if Content-Length > 1MB
    ├─ project_rate_limit          → 429 if project over 1000/min
    │
    ├─ len(events) > 100?          → 400 payload_too_large
    │
    └─ for each event[i]:
           │
           ├─ EventEnvelope.model_validate(raw)
           │       fail → { index, event_id, code, message } added to errors[]
           │
           ├─ user_rate_limit(project_id, user_id, redis)
           │       fail → added to errors[] with code "rate_limited"
           │
           └─ inject project_id (from token) + received_at (server clock)
                   → add to accepted[]
    │
    ├─ accepted not empty?
    │       producer.publish_events(accepted) → Kafka pam.events.raw.v1
    │       failure → 503 internal_error
    │
    └─ 202 { accepted: N, rejected: M, errors: [...] }
```

### Partial rejection

Invalid events are rejected individually — valid events in the same batch still go through. The caller gets a per-event error list with the index and error code.

### Server-side field injection

| Field | Set by | Value |
|---|---|---|
| `project_id` | api-service | Derived from token — never trusted from request body |
| `received_at` | api-service | `datetime.now(UTC)` at the moment of processing |

### Registered events

Defined in `shared/models/events.py`. Unknown `event_name` → `unknown_event` error. Unknown properties on a known event → accepted (forward compatibility).

| Event | Required properties |
|---|---|
| `app_opened` | none |
| `screen_viewed` | `screen_name` |
| `user_identified` | `previous_id` |
| `purchase_completed` | `order_id`, `amount`, `currency` |

### Error codes

| Code | Cause |
|---|---|
| `unknown_event` | `event_name` not in `REGISTERED_EVENTS` |
| `missing_required` | Required envelope field or property missing |
| `invalid_type` | Field has wrong type |
| `rate_limited` | User rate limit exceeded |
| `payload_too_large` | > 100 events or > 1MB body |
| `internal_error` | Kafka unavailable (503) |

---

## 5. POST /v1/identify

**File:** `app/routes/identify.py`

Maps an anonymous device ID to a known user ID, and/or sets profile traits. Publishes the identify payload to Kafka for downstream processing.

### Request

```
POST /v1/identify
Authorization: Bearer pam_live_...

{
  "user_id": "user_42",            ← required
  "anonymous_id": "anon_xyz",      ← optional
  "traits": {                      ← optional, any key-value pairs
    "name": "Asha",
    "plan": "pro",
    "email": "asha@example.com"    ← PII — hashed by event-processor before storage
  },
  "timestamp": "2026-05-01T10:00:00Z"
}
```

### Response 202

```json
{ "user_id": "user_42" }
```

### Flow

```
POST /v1/identify
    │
    ├─ project_rate_limit   → 429 if project over limit
    ├─ user_rate_limit      → 429 if user_id over limit
    │
    ├─ Build payload:
    │     event_id    = uuid4()          ← server-generated
    │     project_id  = ctx.project_id   ← from token
    │     received_at = now(UTC)         ← server clock
    │     anonymous_id = body.anonymous_id (may be null)
    │     traits = body.traits (raw — PII hashed downstream by event-processor)
    │
    ├─ producer.publish_identify(payload) → Kafka pam.events.raw.v1
    │     failure → 503
    │
    └─ 202 { user_id }
```

### Identify vs Alias

| | `/identify` | `/alias` |
|---|---|---|
| Use case | Link anonymous device to known user | Merge two known users |
| How often | Every login | Rare — account merges only |
| `anonymous_id` | Optional (can just update traits) | N/A |

---

## 6. POST /v1/alias

**File:** `app/routes/alias.py`

Merges two known user IDs. Used when you discover that two different user IDs in your system belong to the same person (e.g. web session and mobile session created before login).

### Request

```
POST /v1/alias
Authorization: Bearer pam_live_...

{
  "previous_user_id": "user_web_123",
  "user_id": "user_google_456"
}
```

### Response 202

```json
{ "previous_user_id": "user_web_123", "user_id": "user_google_456" }
```

### Flow

```
POST /v1/alias
    │
    ├─ project_rate_limit   → 429 if project over limit
    │
    ├─ Build payload:
    │     event_id         = uuid4()
    │     previous_user_id = body.previous_user_id
    │     user_id          = body.user_id
    │     project_id       = ctx.project_id
    │     received_at      = now(UTC)
    │
    ├─ producer.publish_alias(payload)  → Kafka pam.events.raw.v1
    │     failure → 503
    │
    └─ 202 { previous_user_id, user_id }
```

---

## 7. GET /v1/health

**File:** `app/main.py`

Liveness probe. No auth required. Returns immediately without checking any dependencies — its only purpose is to confirm the process is alive.

```
GET /v1/health

200 OK
{ "status": "ok", "version": "0.1.0" }
```

Used by: Docker/Kubernetes liveness probe → restart the pod if this fails.

---

## 8. GET /v1/ready

**File:** `app/routes/ready.py`

Readiness probe. No auth required. Checks whether this instance can actually serve traffic by pinging its dependencies.

```
GET /v1/ready

200 OK — all dependencies reachable
{ "status": "ok", "version": "0.1.0", "checks": { "redis": "ok", "kafka": "ok" } }

503 Service Unavailable — one or more dependencies down
{ "status": "degraded", "version": "0.1.0", "checks": { "redis": "unreachable", "kafka": "ok" } }
```

| Check | How | Why |
|---|---|---|
| `redis` | `redis.ping()` | Can't do auth or rate limiting without Redis |
| `kafka` | producer metadata fetch | Can't publish events if Kafka is unreachable |

Used by: Kubernetes readiness probe → removes pod from load balancer when degraded, re-adds when recovered.

---

## 9. Kafka Event Producer

**File:** `app/kafka_producer.py`

Thin aiokafka wrapper that publishes validated payloads to Kafka. Initialised once at startup, stored at `app.state.producer`.

### Methods

| Method | Topic | Used by |
|---|---|---|
| `publish_events(events)` | `pam.events.raw.v1` | `/v1/track` |
| `publish_identify(payload)` | `pam.events.raw.v1` | `/v1/identify` |
| `publish_alias(payload)` | `pam.events.raw.v1` | `/v1/alias` |
| `ping()` | — (metadata fetch) | `/v1/ready` |

All messages are keyed by `user_id` (encoded as UTF-8 bytes) to preserve per-user ordering across Kafka partitions. Payloads are JSON-serialised. Errors are re-raised — route handlers catch them and return 503.

**Acks:** `acks="all"` — producer waits for all in-sync replicas to acknowledge before returning, preventing silent message loss.

---

## 10. Global Middleware

**File:** `app/main.py`

Two HTTP middlewares run on every request, in order:

### Request context middleware

```python
structlog.contextvars.clear_contextvars()
structlog.contextvars.bind_contextvars(request_id=str(uuid4()))
```

Clears structlog context from any previous request (important for async worker reuse) and binds a fresh `request_id`. After auth succeeds, `project_id` and `env` are also bound — every log line in a request automatically carries all three.

### Body size limit middleware

```python
if Content-Length > 1MB → 400 { code: "payload_too_large" }
```

Checked via the `Content-Length` header before the body is read. Note: clients that omit `Content-Length` bypass this check — production deployments should enforce the limit at the reverse proxy (nginx/ALB) as well.
