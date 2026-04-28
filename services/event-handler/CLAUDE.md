# event-handler — Claude Code context

## One-line responsibility
Take validated events from `api-service`, normalize, publish to Kafka.

## Inputs
- HTTP from `api-service` (internal)

## Outputs
- Produces to Kafka topic `pam.events.raw.v1`
- Reads/writes MongoDB `users`, `anonymous_to_user` (for identify/alias merging)

## Hard rules

- NEVER expose public endpoints. Only `api-service` calls this.
- NEVER write to ClickHouse.
- NEVER call notification providers.
- ALWAYS partition Kafka messages by `user_id` to preserve per-user ordering.
- ALWAYS set `received_at` server-side; do not trust client `timestamp` for ordering.

## Key files (once built)

- `app/main.py`
- `app/normalizer.py` — fills in `received_at`, normalizes timestamps, resolves anon→user
- `app/kafka_producer.py` — wraps `aiokafka` producer from `shared/`
- `app/identify.py` — special handling for `user_identified` and alias events

## Dependencies on `shared/`

- `shared.models.events`
- `shared.kafka.producer`
- `shared.clients.mongo`

## Reference docs

- Event schema: [`../../docs/event-schema.md`](../../docs/event-schema.md)
- Kafka topics: [`../../docs/kafka-topics.md`](../../docs/kafka-topics.md)
- MongoDB schema: [`../../docs/mongodb-collections.md`](../../docs/mongodb-collections.md)

## Local run

```bash
uv run uvicorn app.main:app --reload --port 8002
```
