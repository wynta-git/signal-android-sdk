# PAM — Player Analytics & Marketing Platform

A MoEngage-style customer engagement platform. Ingests events from client SDKs, stores them for analytics, builds user segments, runs campaigns, and delivers notifications.

## Services

This is a Python monorepo with six independently deployable services:

| Service | Responsibility | Stack |
|---|---|---|
| `api-service` | Public ingestion API. Handles auth, token validation, rate limiting. Forwards valid requests to `event-handler`. | FastAPI |
| `event-handler` | Receives events from `api-service`, normalizes payloads, publishes to Kafka. | FastAPI / aiokafka |
| `event-processor` | Consumes Kafka topics, validates against the event schema, writes to ClickHouse. | aiokafka / clickhouse-driver |
| `segmentation-engine` | Evaluates segment rules against user/event data. Persists segments in MongoDB. | FastAPI / motor |
| `campaign-engine` | Defines and triggers campaigns based on events and segments. Persists in MongoDB. | FastAPI / motor |
| `notifications-engine` | Delivers notifications (push / email / SMS / webhook) for triggered campaigns. | FastAPI / Celery-style workers |

Shared Python code (event models, Kafka client, DB clients) lives in `shared/`.

## Tech stack

- **API layer**: FastAPI (Python 3.11+)
- **Message bus**: Kafka
- **Analytics DB**: ClickHouse (events, time-series)
- **Operational DB**: MongoDB (users, segments, campaigns)
- **Cache / rate-limit / pub-sub**: Redis

## Getting started

See [`docs/local-dev.md`](docs/local-dev.md) for spinning up Kafka, ClickHouse, MongoDB, and Redis locally and publishing your first test event end-to-end.

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system diagram and service boundaries
- [`docs/`](docs/) — cross-service contracts (event schema, Kafka topics, DB schemas, API specs)
- `services/<service>/CLAUDE.md` — per-service implementation notes

## Repo layout

```
.
├── services/         # Six deployable services
├── shared/           # Cross-service Python lib (event models, kafka utils, DB clients)
├── infra/            # docker-compose, k8s manifests, CI templates
├── docs/             # Cross-service contracts and runbooks
└── .claude/          # Claude Code custom slash commands
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).
