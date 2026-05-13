# Kafka Topics

Single source of truth for topic names, partitions, retention, keys, producers, and consumers. Update this when adding a topic.

## Naming convention

`pam.<domain>.<event>.v<version>`

- `pam.events.raw.v1` — incoming raw events
- `pam.bonus.raw.v1` — copy of raw events classified as bonus
- `pam.events.invalid.v1` — DLQ for events that failed validation
- `pam.campaigns.send.v1` — campaign send jobs for notifications-engine
- `pam.notifications.delivery.v1` — delivery status events back into analytics

Always include `.v<n>` suffix. Bump version for breaking schema changes; run old + new in parallel during migration.

## Topics

### `pam.events.raw.v1`
Every accepted event, immediately after `api-service` validation.

| Setting | Value |
|---|---|
| Partitions | 24 (start) — sized for parallel consumer growth |
| Replication | 3 (prod) / 1 (dev) |
| Retention | 7 days |
| Key | `user_id` (preserves per-user ordering) |
| Compression | `lz4` |
| Producer | `api-service` |
| Consumers | `event-processor` (group: `event-processor`), `campaign-engine` (group: `campaign-trigger`) |

### `pam.bonus.raw.v1`
Copy of every accepted event whose `event_name` is in the `bonus_event_types` collection. Written by `api-service` in addition to `pam.events.raw.v1`.

| Setting | Value |
|---|---|
| Partitions | 12 |
| Replication | 3 (prod) / 1 (dev) |
| Retention | 7 days |
| Key | `user_id` |
| Compression | `gzip` |
| Producer | `api-service` |
| Consumers | TBD (bonus processing pipeline) |

### `pam.events.invalid.v1`
DLQ for events that failed schema validation in `event-processor`.

| Setting | Value |
|---|---|
| Partitions | 6 |
| Retention | 30 days |
| Key | `user_id` |
| Producer | `event-processor` |
| Consumers | manual inspection / replay tooling |

### `pam.campaigns.send.v1`
Send jobs emitted by `campaign-engine` for `notifications-engine`.

| Setting | Value |
|---|---|
| Partitions | 12 |
| Retention | 3 days |
| Key | `user_id` (one job per user per campaign trigger) |
| Producer | `campaign-engine` |
| Consumers | `notifications-engine` (group: `notif-sender`) |

### `pam.notifications.delivery.v1`
Delivery results (sent / failed / opened / clicked) emitted by `notifications-engine`.

| Setting | Value |
|---|---|
| Partitions | 12 |
| Retention | 7 days |
| Key | `user_id` |
| Producer | `notifications-engine` |
| Consumers | `event-processor` (treats them as analytics events) |

## Consumer group conventions

- One consumer group per logical workload, named `<service>-<workload>` (e.g. `event-processor-main`, `campaign-trigger`).
- Different services consuming the same topic must use different groups (so each gets all messages).
- Same service running multiple replicas shares one group (load balancing).

## Ordering and idempotency

- Partition key is `user_id` so per-user events stay ordered.
- Consumers must be idempotent — dedupe on `event_id` (envelope) when writing to durable stores.
- ClickHouse `ReplacingMergeTree` with `event_id` ORDER BY handles dedupe at the storage layer.

## Operational

- All topics auto-created in dev (`infra/docker-compose.yml`).
- Production topics created via Terraform / `kafka-topics.sh` — never let them auto-create.
- Watch metrics: consumer lag per group, partition skew, DLQ throughput.
