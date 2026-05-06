# PAM — Claude Code context

This file is loaded into every Claude Code session. Keep it tight — bloat costs context.

## What this project is

PAM is a player analytics & marketing platform (MoEngage-style). Five Python services in one monorepo.

## Services and where they live

- `services/api-service` — Public ingestion API. Auth, token validation, rate limiting, **publishes validated events directly to Kafka**. Entry point for all client SDK calls.
- `services/event-processor` — Kafka consumer → ClickHouse writer.
- `services/segmentation-engine` — Segment rules over events/users → MongoDB.
- `services/campaign-engine` — Campaigns triggered by events and segments → MongoDB.
- `services/notifications-engine` — Delivers push/email/SMS/webhook.

Shared code: `shared/` (event Pydantic models, Kafka client wrapper, DB clients). **Never duplicate event schema across services — always import from `shared/`.**

## Tech stack

- Python 3.11+, FastAPI, async everywhere (no sync I/O on hot paths)
- Kafka (aiokafka), ClickHouse (clickhouse-driver async), MongoDB (motor), Redis (redis.asyncio)
- Pydantic v2 for all request/response and event models

## Conventions

- **Package manager**: `uv` (preferred) or `pip` with each service's `pyproject.toml`.
- **Formatter / linter**: `ruff` (format + lint). Run before commit.
- **Type checker**: `mypy --strict` on `shared/` at minimum.
- **Tests**: `pytest`. Each service has its own `tests/`.
- **Imports**: absolute imports inside each service. Cross-service code only via `shared/`.
- **Logging**: structured JSON logs (use `structlog`). Always include `event_id`, `user_id`, `project_id` when available.
- **Async**: prefer `async def`. No blocking I/O in request handlers.

## Hard rules

- Never write event payloads directly to ClickHouse from `api-service`. **Always go through Kafka** so we can replay and scale consumers independently.
- Never read/write MongoDB from `event-processor`. It writes ClickHouse only.
- Never define event schemas inline in a service. Use `shared/models/events.py`.
- Never log raw PII (email, phone). Hash or redact first.
- Never bypass `api-service` from external clients. All ingress is authenticated there.

## Where to find things

- Event payload contract → [`docs/event-schema.md`](docs/event-schema.md)
- Kafka topics → [`docs/kafka-topics.md`](docs/kafka-topics.md)
- ClickHouse tables → [`docs/clickhouse-schema.md`](docs/clickhouse-schema.md)
- MongoDB collections → [`docs/mongodb-collections.md`](docs/mongodb-collections.md)
- Redis usage → [`docs/redis-usage.md`](docs/redis-usage.md)
- Public API → [`docs/api-contracts.md`](docs/api-contracts.md)
- Auth flow → [`docs/auth.md`](docs/auth.md)
- System diagram → [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Local dev → [`docs/local-dev.md`](docs/local-dev.md)

## Common commands

(Filled in as services are built.)

```bash
# Spin up infra
docker compose -f infra/docker-compose.yml up -d

# Run a service locally (example)
cd services/api-service && uv run uvicorn app.main:app --reload

# Run all tests
make test   # or: for d in services/*; do (cd $d && uv run pytest); done

# Lint + format
ruff check . && ruff format .
```

## Slash commands

- `/add-event` — scaffold a new event type (updates schema doc, adds Pydantic model, ClickHouse migration, validator).
- `/new-service` — scaffold a new service folder with the standard layout.

## When in doubt

Read the relevant doc in `docs/` first. If the contract isn't documented there, that's a bug — update the doc as part of the change.
