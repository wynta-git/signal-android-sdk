# segmentation-engine — Claude Code context

## One-line responsibility
Owns segment definitions and memberships. Compiles DSL → queries.

## Inputs
- HTTP (internal admin API) — CRUD for segments
- Kafka consumer on `pam.events.raw.v1` (group: `segmentation-trigger`) — for `on_event` segment refresh
- Cron — for `scheduled` segment refresh

## Outputs
- MongoDB `segments` (writes)
- Redis `pam:seg:{project_id}:{segment_id}:members` Set + `:joined` Hash (writes — primary membership store)
- ClickHouse `pam.events_{project_id}` (reads only, per-client table)
- MongoDB `users` (reads only)

## Hard rules

- NEVER write to ClickHouse. Reads only.
- NEVER write to `users`, `campaigns`, `notification_*` collections.
- NEVER expose public endpoints — internal API only, mTLS.
- ALWAYS scope every query by `project_id` (multi-tenant isolation).
- NEVER allow user-supplied raw SQL. DSL must be compiled by us.

## Key files (once built)

- `app/main.py` — FastAPI admin API
- `app/dsl/compiler.py` — DSL → SQL/Mongo
- `app/dsl/validator.py` — DSL JSON validation
- `app/refresh/scheduled.py` — cron-driven refresh
- `app/refresh/event_driven.py` — Kafka-driven refresh
- `app/storage.py` — Mongo writes for segments/memberships

## Dependencies on `shared/`

- `shared.clients.clickhouse`, `shared.clients.mongo`, `shared.clients.redis`
- `shared.kafka.consumer`

## Reference docs

- DSL spec: [`../../docs/segmentation-dsl.md`](../../docs/segmentation-dsl.md)
- ClickHouse schema: [`../../docs/clickhouse-schema.md`](../../docs/clickhouse-schema.md)
- MongoDB schema: [`../../docs/mongodb-collections.md`](../../docs/mongodb-collections.md)

## Local run

```bash
uv run uvicorn app.main:app --reload --port 8003
```
