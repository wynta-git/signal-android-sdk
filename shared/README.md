# shared/

Cross-service Python library. Anything used by 2+ services lives here.

## Contents (planned)

```
shared/
├── pyproject.toml
├── shared/
│   ├── __init__.py
│   ├── models/
│   │   ├── events.py        # Pydantic models for every event type + EVENT_REGISTRY
│   │   ├── envelope.py      # The outer event envelope
│   │   ├── users.py         # User profile model
│   │   └── campaigns.py     # Campaign / send job models
│   ├── kafka/
│   │   ├── producer.py      # aiokafka producer wrapper
│   │   ├── consumer.py      # aiokafka consumer wrapper
│   │   └── topics.py        # Topic name constants — single source of truth
│   ├── clients/
│   │   ├── clickhouse.py
│   │   ├── mongo.py
│   │   └── redis.py
│   ├── auth/
│   │   ├── token.py         # Token hashing helpers (used by api-service)
│   │   └── pii.py           # PII hashing helpers
│   ├── logging.py           # structlog setup
│   └── settings.py          # Base pydantic-settings class
└── tests/
```

## Why a shared package

**To prevent contract drift.** Without this, each service would define its own version of the event schema, kafka topic names, and DB clients. They drift, and the system breaks at the seams — exactly where bugs are hardest to find.

## Install in a service

In each service's `pyproject.toml`:

```toml
[tool.uv.sources]
shared = { path = "../../shared", editable = true }

[project]
dependencies = [
  "shared",
  # ...
]
```

Run `uv sync` in the service directory. Edits to `shared/` are picked up immediately.

## Rules

- `shared/` must NEVER import from any service.
- `shared/` must stay async-friendly (no blocking I/O in helpers).
- Breaking changes here ripple to every service — bump the major version and migrate one service at a time.

## Test

```bash
cd shared && uv run pytest
uv run mypy --strict shared/
```
