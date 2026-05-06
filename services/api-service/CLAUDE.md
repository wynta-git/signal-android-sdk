# api-service — Claude Code context

## One-line responsibility
Public ingress. Authenticate, rate-limit, validate envelope, publish to Kafka.

## Inputs
- HTTP from public internet (`/v1/track`, `/v1/identify`, `/v1/alias`, `/v1/health`, `/v1/ready`)

## Outputs
- Publishes to Kafka topic `pam.events.raw.v1` (events, identify, alias payloads)
- Reads/writes Redis (rate limit, token cache)
- Reads MongoDB (`projects`, `tokens` collections)

## Hard rules (NEVER do these)

- NEVER write to ClickHouse.
- NEVER read or write `users`, `segments`, `campaigns` collections.
- NEVER trust `project_id` from the request body — derive from the validated token.
- NEVER log `Authorization` headers, raw tokens, or token hashes.
- NEVER cache token validation longer than 5 minutes.
- NEVER buffer events in-process when Kafka is unavailable — fail fast with 503.

## Key files (once built)

- `app/main.py` — FastAPI app
- `app/routes/track.py`, `identify.py`, `alias.py`, `health.py`
- `app/auth/token.py` — token validation + Redis cache
- `app/middleware/ratelimit.py` — per-project per-user rate limit
- `app/kafka_producer.py` — aiokafka producer wrapper

## Dependencies on `shared/`

- `shared.models.events` — envelope validation
- `shared.clients.mongo` — Mongo client setup
- `shared.clients.redis` — Redis client setup
- `shared.clients.kafka` — Kafka producer setup

## Token authentication

PAM uses **opaque tokens** (`pam_live_<random32>`, `pam_test_<random32>`), not JWTs.

### Why not JWT?

| | JWT | PAM opaque token |
|---|---|---|
| Validation | Crypto only, no DB | DB lookup required |
| Revocation | Needs a blocklist | Flip `status: "revoked"` in MongoDB |
| Scopes | Baked in at issuance | Live in DB, changeable without reissue |
| Metadata exposure | Visible in decoded token | None — token is meaningless without DB |
| DB load at scale | None | Cached in Redis (5-min TTL) |

Key reasons for opaque tokens:
- **Instant revocation** — stolen token? flip a DB field. With JWT you'd need a blocklist anyway.
- **Server-controlled `project_id`** — never derived from the request body. A malicious client cannot claim another tenant's project.
- **Live scope changes** — update the DB record, no need to reissue tokens.

### Validation flow

```
Request: Authorization: Bearer pam_live_a7Hk3...
  │
  ▼
SHA-256 hash (raw token never stored or logged after this)
  │
  ├─→ Redis EXISTS pam:token:<hash>:revoked  ──yes──→ 401 (emergency revoke)
  │
  ├─→ Redis GET pam:token:<hash>             ──hit──→ TokenContext (no DB call)
  │
  └─→ MongoDB tokens.find_one({token_hash, status: "active"})
        │ not found → 401
        └─→ Redis SET cache TTL 300s
              + create_task(last_used_at)   ← non-blocking, audit only
              → TokenContext
```

### Why Redis?

MongoDB lookup on every request would be 5–10ms extra and collapse under load. Redis caches the result for 5 minutes — cache-hit validation costs ~0.5ms with zero MongoDB reads.

Redis is **not** the source of truth. It can be flushed at any time. MongoDB is authoritative.

### Why MongoDB?

Durable source of truth for `{project_id, scope, status}` per token. Revocation, scope changes, and last-used auditing all live here.

### TokenContext (what routes receive)

```python
@dataclass(frozen=True)
class TokenContext:
    project_id: str               # always from DB, never from request body
    scope: list[str]              # e.g. ["events:write"]
    env: Literal["live", "test"]  # derived from token prefix
```

`admin` scope satisfies any scope check. `EventsWriteDep` / `AdminDep` type aliases in `dependencies.py` are the idiomatic way to protect routes.

## Rate limiting

Runs **after** auth (needs `project_id` from token) and **before** any business logic.

### Two levels

| Level | Redis key | Default limit |
|---|---|---|
| Project | `pam:rate:proj:{project_id}:min:{epoch_min}` | 1000 req/min |
| User | `pam:rate:user:{project_id}:{user_id}:min:{epoch_min}` | 100 req/min |

Project-level limit is checked on every request via the `project_rate_limit` FastAPI dependency.
User-level limit is checked inside route handlers where `user_id` is available from the request body.

### How it works (fixed window counter)

```
Request arrives for proj_abc, current minute window = 1234567
    │
    ▼
Redis pipeline:
    INCR  pam:rate:proj:proj_abc:min:1234567  → count = 47
    EXPIRE pam:rate:proj:proj_abc:min:1234567    60s
    │
    ├─ count <= 1000 → allow
    └─ count >  1000 → 429 Too Many Requests
```

Key expires automatically after 60s — next minute gets a fresh counter. Pipeline batches INCR + EXPIRE atomically so the key always gets a TTL.

### Per-project custom limits

Default limits are constants in `ratelimit.py`. Per-project overrides are stored in `projects.settings.rate_limits` in MongoDB and fetched on cache miss (cached in Redis alongside the token).

### Client response on breach

```json
HTTP 429
{ "code": "rate_limited", "message": "Too many requests" }
```

SDK should retry with exponential backoff + jitter, capped at 5 retries.

### FastAPI wiring

- `project_rate_limit` — dependency, depends on `get_token_context`, checks project counter
- `user_rate_limit(project_id, user_id, redis)` — utility called directly from route handlers
- `RateLimitedDep` — type alias combining auth + project rate limit, used in route signatures

## Reference docs

- API contract: [`../../docs/api-contracts.md`](../../docs/api-contracts.md)
- Auth: [`../../docs/auth.md`](../../docs/auth.md)
- Rate limiting: [`../../docs/redis-usage.md`](../../docs/redis-usage.md)
- Event envelope: [`../../docs/event-schema.md`](../../docs/event-schema.md)

## Local run

```bash
uv run uvicorn app.main:app --reload --port 8001
```
