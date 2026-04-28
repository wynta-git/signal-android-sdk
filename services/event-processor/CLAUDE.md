# event-processor — Claude Code context

## One-line responsibility
Kafka → validate → ClickHouse. Owner of the analytics events table.

## Inputs
- Consumes Kafka topic `pam.events.raw.v1` (group: `event-processor-main`)

## Outputs
- Writes ClickHouse `pam.events` (batched)
- Produces to Kafka DLQ `pam.events.invalid.v1` for invalid events

## Hard rules

- NEVER read or write MongoDB. Not users, not segments, nothing.
- NEVER expose business endpoints. Health/metrics only.
- NEVER drop events silently — invalid events go to DLQ.
- ALWAYS batch ClickHouse writes (target 1000 events or 1s, whichever first).
- ALWAYS dedupe on `event_id` — `ReplacingMergeTree` handles it but consumer should also handle replays.

## Key files (once built)

- `app/main.py` — consumer loop
- `app/validator.py` — uses `shared.models.events.EVENT_REGISTRY`
- `app/writer.py` — ClickHouse batched insert
- `app/dlq.py` — DLQ producer
- `migrations/` — ClickHouse SQL migrations
- `migrations/run.py` — idempotent migration runner

## Dependencies on `shared/`

- `shared.models.events` — schema validation
- `shared.kafka.consumer`
- `shared.clients.clickhouse`

## Reference docs

- ClickHouse schema: [`../../docs/clickhouse-schema.md`](../../docs/clickhouse-schema.md)
- Event schema: [`../../docs/event-schema.md`](../../docs/event-schema.md)
- Kafka topics: [`../../docs/kafka-topics.md`](../../docs/kafka-topics.md)

## Local run

```bash
uv run python -m app.main
```
