# ClickHouse Schema

Owner: `event-processor` writes; everyone else reads.

## Database: `pam`

## Tables

### `pam.events`
The main events table. Wide, append-mostly, partitioned by date.

```sql
CREATE TABLE pam.events
(
    event_id          UUID,
    event_name        LowCardinality(String),
    schema_version    UInt8,
    project_id        LowCardinality(String),
    user_id           String,
    session_id        String,
    timestamp         DateTime64(3, 'UTC'),
    received_at       DateTime64(3, 'UTC'),

    sdk_name          LowCardinality(String),
    sdk_version       String,
    platform          LowCardinality(String),
    os                LowCardinality(String),

    -- Common revenue columns (promoted out of properties for fast aggregation)
    amount            Nullable(Float64),
    currency          LowCardinality(Nullable(String)),
    order_id          Nullable(String),

    -- Catch-all for everything else
    properties        Map(String, String),

    insert_date       Date DEFAULT toDate(received_at)
)
ENGINE = ReplacingMergeTree(received_at)
PARTITION BY toYYYYMM(insert_date)
ORDER BY (project_id, event_name, user_id, timestamp, event_id)
TTL insert_date + INTERVAL 13 MONTH
SETTINGS index_granularity = 8192;
```

**Why these choices:**
- `ReplacingMergeTree` — dedupe on `event_id` if the same event arrives twice.
- `ORDER BY (project_id, event_name, user_id, timestamp, event_id)` — most queries filter on project + event_name; `user_id` keeps per-user reads cheap.
- `Map(String, String)` for `properties` — schemaless, handles new properties without migrations. Cast at query time.
- `LowCardinality` on enum-ish columns — big disk and query speedup.
- `PARTITION BY toYYYYMM(insert_date)` — monthly drops for retention, daily would create too many parts.
- TTL 13 months — covers year-over-year analysis. Adjust per project tier.

### `pam.user_profiles_mv`
Materialized view: latest known traits per user. Updated from `user_identified` events.

(Defined when `segmentation-engine` is built — placeholder.)

### `pam.events_daily_agg`
Materialized view: per-project, per-event daily counts. Backs dashboards.

(Defined when analytics queries demand it — placeholder.)

## Migrations

- Location: `services/event-processor/migrations/`
- Tool: `clickhouse-migrations` or hand-rolled SQL files numbered `0001_init.sql`, `0002_add_x.sql`.
- Idempotent: every migration starts with `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Run on service startup (idempotent) and via CI for prod.

## Indexes / projections

Add only when query patterns are known. Likely candidates later:
- Bloom filter index on `user_id` if cardinality is huge.
- Projection ordered by `(project_id, timestamp)` for time-range scans.

## What goes in dedicated columns vs `properties` map

**Dedicated column** if:
- Filtered or aggregated in nearly every query (`amount`, `currency` for revenue).
- High cardinality and used in `WHERE` clauses regularly.
- Type matters (date math, numeric aggs).

**`properties` map** otherwise. Default to map; promote later when query patterns force it.

## Don'ts

- Do not write from any service other than `event-processor`.
- Do not delete events. Use TTL for retention.
- Do not run heavy ad-hoc queries on production replicas without approval.
