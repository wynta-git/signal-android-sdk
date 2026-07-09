# ClickHouse Schema

Owner: `event-processor` writes; everyone else reads.

## Database: `pam`

## Tables

### `pam.events_{project_id}`
One table per project (e.g. `pam.events_proj_demo`). Created automatically by the event-processor on the first event for that project. Base columns are fixed; each `properties` key becomes its own `Nullable(String)` column added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` as new keys arrive.

```sql
CREATE TABLE IF NOT EXISTS pam.events_{project_id}
(
    event_id       UUID,
    event_name     LowCardinality(String),
    schema_version UInt8,
    project_id     LowCardinality(String),
    site_id        LowCardinality(String),
    client_id      LowCardinality(String),
    user_id        String,
    pam_user_id    Nullable(Int64),        -- MySQL pam_user_mapping.id, resolved by event-processor
    session_id     String,
    timestamp      DateTime64(3, 'UTC'),
    received_at    DateTime64(3, 'UTC'),
    platform       LowCardinality(String),
    device_type    LowCardinality(String),
    brand_id       LowCardinality(String),
    amount         Nullable(Float64),      -- promoted from properties.amount
    currency       LowCardinality(Nullable(String)),  -- promoted from properties.currency
    insert_date    Date DEFAULT toDate(received_at),
    created_at     DateTime DEFAULT now()
    -- additional Nullable(String) columns added dynamically per properties key
)
ENGINE = ReplacingMergeTree(received_at)
PARTITION BY toYYYYMM(insert_date)
ORDER BY (project_id, event_name, user_id, timestamp, event_id)
TTL insert_date + INTERVAL 13 MONTH
SETTINGS index_granularity = 8192;
```

**Why per-client tables:**
- Each project's property schema is independent — no null bloat from other projects' keys.
- `ReplacingMergeTree` — dedupe on `event_id` if the same event arrives twice.
- `amount` and `currency` are promoted base columns for fast revenue aggregation.
- Dynamic column addition via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — new property keys land as typed columns, no catch-all map needed.
- `LowCardinality` on enum-ish columns — big disk and query speedup.
- TTL 13 months — covers year-over-year analysis.

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
