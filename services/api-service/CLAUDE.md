# api-service — Claude Code context

## One-line responsibility
Public ingress. Authenticate, rate-limit, validate envelope, forward to `event-handler`.

## Inputs
- HTTP from public internet (`/v1/track`, `/v1/identify`, `/v1/alias`, `/v1/health`, `/v1/ready`)

## Outputs
- HTTP forward to `event-handler` (internal)
- Reads/writes Redis (rate limit, token cache)
- Reads MongoDB (`projects`, `tokens` collections)

## Hard rules (NEVER do these)

- NEVER write to Kafka. Forward to `event-handler` and let it publish.
- NEVER write to ClickHouse.
- NEVER read or write `users`, `segments`, `campaigns` collections.
- NEVER trust `project_id` from the request body — derive from the validated token.
- NEVER log `Authorization` headers, raw tokens, or token hashes.
- NEVER cache token validation longer than 5 minutes.

## Key files (once built)

- `app/main.py` — FastAPI app
- `app/routes/track.py`, `identify.py`, `alias.py`, `health.py`
- `app/auth/token.py` — token validation + Redis cache
- `app/middleware/ratelimit.py` — per-project per-user rate limit
- `app/forwarder.py` — HTTPX client to event-handler

## Dependencies on `shared/`

- `shared.models.events` — envelope validation
- `shared.clients.mongo` — Mongo client setup
- `shared.clients.redis` — Redis client setup

## Reference docs

- API contract: [`../../docs/api-contracts.md`](../../docs/api-contracts.md)
- Auth: [`../../docs/auth.md`](../../docs/auth.md)
- Rate limiting: [`../../docs/redis-usage.md`](../../docs/redis-usage.md)
- Event envelope: [`../../docs/event-schema.md`](../../docs/event-schema.md)

## Local run

```bash
uv run uvicorn app.main:app --reload --port 8001
```
