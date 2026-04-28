# Contributing to PAM

## Branch naming

- `feat/<short-desc>` — new features
- `fix/<short-desc>` — bug fixes
- `chore/<short-desc>` — tooling, deps, refactors
- `docs/<short-desc>` — docs only

## Commit messages

Conventional commits: `<type>(<scope>): <subject>`

Examples:
- `feat(api-service): add token rotation endpoint`
- `fix(event-processor): retry on clickhouse timeout`
- `docs(event-schema): add purchase event`

Scopes: `api-service`, `event-handler`, `event-processor`, `segmentation-engine`, `campaign-engine`, `notifications-engine`, `shared`, `infra`, `docs`.

## Adding a new event type

This is the most common change. Use `/add-event` in Claude Code, or do it manually:

1. Add the event to [`docs/event-schema.md`](docs/event-schema.md).
2. Add the Pydantic model to `shared/models/events.py`.
3. Add a ClickHouse migration if the event has new properties needing dedicated columns.
4. Add tests in `services/event-processor/tests/`.
5. Bump the schema version if the change is breaking.

## Adding a new Kafka topic

1. Document it in [`docs/kafka-topics.md`](docs/kafka-topics.md): name, partitions, retention, key, producer, consumers.
2. Add producer/consumer wiring in `shared/kafka/`.
3. Update `infra/docker-compose.yml` topic auto-create config if needed.

## PR checklist

- [ ] Tests added/updated and passing
- [ ] `ruff check` and `ruff format` clean
- [ ] `mypy` clean for `shared/` if touched
- [ ] Relevant doc in `docs/` updated (event schema, kafka topics, DB schemas, API contracts)
- [ ] `CHANGELOG.md` updated if user-visible
- [ ] No PII in logs
- [ ] No direct DB access across service boundaries

## Style

- Async by default. Sync code only for CPU-bound work, and only inside a thread pool.
- Type-hint everything in `shared/`. Type-hint new code in services.
- Pydantic v2 models for all I/O. No raw dicts at service boundaries.
- Structured logs only. No `print`.

## Code review

- One approver minimum. Author cannot self-merge.
- Reviewers should check that cross-service contracts (event schema, topic shape, API contract) are still consistent — these are easy to break in a monorepo.
