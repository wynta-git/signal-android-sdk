# Local Development

How to spin up PAM end-to-end on your machine.

## Prerequisites

- Python 3.11+
- [`uv`](https://github.com/astral-sh/uv) (recommended) or pip
- Docker Desktop (for Kafka, ClickHouse, MongoDB, Redis)
- Make (optional but convenient)

## 1. Clone and configure

```bash
git clone <repo> && cd PAM
cp .env.example .env   # once .env.example exists
# Edit .env if needed — defaults work for fresh local setup.
```

## 2. Start infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d
```

This brings up:
- Kafka (with auto-topic creation in dev) on `localhost:9092`
- ClickHouse on `localhost:8123` (HTTP) and `localhost:9000` (native)
- MongoDB on `localhost:27017`
- Redis on `localhost:6379`
- Kafka UI on `http://localhost:8080`

Wait until they're all healthy:
```bash
docker compose -f infra/docker-compose.yml ps
```

## 3. Install dependencies

Per service (they each have their own `pyproject.toml`):

```bash
cd services/api-service && uv sync
cd ../event-handler && uv sync
# ...etc
```

Or from the root with a Makefile target (once added):
```bash
make install
```

## 4. Run database migrations

ClickHouse:
```bash
cd services/event-processor
uv run python -m migrations.run
```

MongoDB index creation:
```bash
cd services/api-service
uv run python -m app.scripts.ensure_indexes
```

## 5. Start services

In separate terminals:

```bash
# Terminal 1: api-service
cd services/api-service && uv run uvicorn app.main:app --reload --port 8001

# Terminal 2: event-handler
cd services/event-handler && uv run uvicorn app.main:app --reload --port 8002

# Terminal 3: event-processor (Kafka consumer)
cd services/event-processor && uv run python -m app.main

# Terminal 4: segmentation-engine
cd services/segmentation-engine && uv run uvicorn app.main:app --reload --port 8003

# Terminal 5: campaign-engine
cd services/campaign-engine && uv run uvicorn app.main:app --reload --port 8004

# Terminal 6: notifications-engine
cd services/notifications-engine && uv run python -m app.main
```

A `Procfile` or `tmuxp` config will be added to make this one command.

## 6. Send a test event

Once a project + token are seeded:

```bash
curl -X POST http://localhost:8001/v1/track \
  -H "Authorization: Bearer pam_test_<your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "event_id": "550e8400-e29b-41d4-a716-446655440000",
      "event_name": "screen_viewed",
      "schema_version": 1,
      "user_id": "user_42",
      "timestamp": "2026-04-27T10:00:00.000Z",
      "sdk": {"name": "curl", "version": "0"},
      "properties": {"screen_name": "home"}
    }]
  }'
```

Verify it landed in ClickHouse:
```bash
docker exec -it pam-clickhouse clickhouse-client \
  --query "SELECT * FROM pam.events WHERE user_id = 'user_42' LIMIT 5 FORMAT Vertical"
```

## Seed data

A seed script at `infra/seed.py` (to be added) creates:
- One test project
- One test token (printed to stdout)
- A couple of test segments and a sample campaign

Run with:
```bash
uv run python infra/seed.py
```

## Common issues

- **Kafka consumer lag building up**: check `event-processor` is running. Check Kafka UI at `localhost:8080`.
- **ClickHouse "Cannot insert"**: migrations haven't run, or column mismatch with new event property.
- **MongoDB "no primary"**: replica set not initialized; restart the mongo container.
- **Redis connection refused**: container not up, or port collision. `docker compose ps`.

## Tearing down

```bash
docker compose -f infra/docker-compose.yml down -v   # -v wipes volumes
```
