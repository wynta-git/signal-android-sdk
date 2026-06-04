# Event Processor — Processing Pipeline

Everything that happens between Kafka consumption and a ClickHouse write.

---

## Stage 1: Consume from Kafka

**[consumer.py:84–96](app/consumer.py#L84-L96)**

Pulls batches of up to **500 messages** (or flushes after **5 seconds**) from topic `pam.events.raw.v1`. Each raw message is `json.loads`-decoded. Bad JSON is silently dropped (warning logged) — it does not block the rest of the batch.

```
Raw Kafka message (bytes)
    ↓
json.loads(msg.value.decode())
    ↓
dict[str, Any]
    ├─ Bad JSON / decode error → log warning, skip
    └─ Success → add to batch list
```

---

## Stage 2: Group by `project_id`

**[consumer.py:101–105](app/consumer.py#L101-L105)**

Events are bucketed into `dict[project_id → list[events]]`. Each bucket is written to its own ClickHouse table `pam.events_{project_id}`. Missing `project_id` falls back to `"__unknown__"`.

---

## Stage 3: Deduplication via Redis

**[writer.py:124–136](app/writer.py#L124-L136)**

For each event, atomically checks Redis using `SET NX EX 86400` on:

```
Key: pam:dedup:{project_id}:{event_id}
TTL: 24 hours (86400 s)
```

First writer wins; duplicates are dropped and logged as `dedup_events_dropped`.

---

## Stage 4: Field Alias Resolution

**[alias_manager.py:31–56](app/alias_manager.py#L31-L56)**

Loads alias maps from MongoDB (cached 30 s in-memory per `(project_id, event_name)` pair). Maps custom/SDK property names → canonical column names. Applied atomically — no cascading `a → b → c` chains.

---

## Stage 5: Table Bootstrap

**[schema_manager.py:228–251](app/schema_manager.py#L228-L251)**

First time a `project_id` is seen, issues:

```sql
CREATE TABLE IF NOT EXISTS pam.events_{project_id} ( <base columns> )
ENGINE = ReplacingMergeTree(received_at)
...
```

Result is cached in-memory — subsequent events for the same project skip this entirely. `CREATE TABLE IF NOT EXISTS` makes concurrent consumer instances safe.

---

## Stage 6: Dynamic Column Mapping & DDL

**[schema_manager.py:257–328](app/schema_manager.py#L257-L328) / [writer.py:156–164](app/writer.py#L156-L164)**

The most complex stage. Handles arbitrary `properties` keys from client SDKs.

### 6a — Key sanitization & Redis mapping

For each `properties` key in the batch:

1. Check Redis hash `pam:col_map:{project_id}` for an existing mapping
2. If missing: sanitize the raw key → safe ClickHouse column name
3. Write mapping atomically to Redis via `HSETNX` (first writer wins)
4. Persist winners to MongoDB `col_map` collection

**Sanitization rules (`sanitize_key()`):**

| Step | Rule |
|------|------|
| 1 | Lowercase |
| 2 | Replace `[^a-z0-9_]` → `_` |
| 3 | Strip leading `_`; prepend `prop_` if starts with digit |
| 4 | Truncate to 64 chars |
| 5 | Append `_col` if name collides with a ClickHouse reserved word |

### 6b — Distributed DDL lock (ALTER TABLE)

For columns not yet present in ClickHouse:

```
Winner (SET NX succeeds):
  ├─ Re-check under lock (another winner may have just added it)
  ├─ ALTER TABLE ADD COLUMN IF NOT EXISTS <col> Nullable(String)
  ├─ Update in-memory column cache
  └─ Release lock (or let 30 s TTL expire)

Loser (SET NX fails):
  ├─ Poll Redis EXIST every 100 ms (max 10 s)
  ├─ Once lock is gone, invalidate and resync local column cache
  └─ Proceed to insert (column now exists)
```

Lock key: `pam:schema_lock:{project_id}:{column_name}`, TTL 30 s.

Only one consumer performs the DDL per new column. All others wait cheaply in Redis.

---

## Stage 7: Row Transformation

**[writer.py:85–103](app/writer.py#L85-L103)**

Each event dict is flattened into an ordered list of values aligned to the column list.

### Base columns (15 fixed)

| Source field | Column | Notes |
|---|---|---|
| `event_id` | `event_id` | String UUID passthrough |
| `event_name` | `event_name` | LowCardinality |
| `schema_version` | `schema_version` | Defaults to 1 |
| `project_id` | `project_id` | LowCardinality |
| `user_id` | `user_id` | Partition key |
| `session_id` | `session_id` | Empty string if null |
| `timestamp` | `timestamp` | Parsed from ISO string; falls back to `now()` |
| `received_at` | `received_at` | Falls back to `timestamp` if absent |
| `sdk.name` | `sdk_name` | |
| `sdk.version` | `sdk_version` | |
| `device.platform` | `platform` | Empty string if absent |
| `device.os` | `os` | Empty string if absent |
| `properties.amount` | `amount` | Promoted out of dynamic map |
| `properties.currency` | `currency` | Promoted out of dynamic map |
| `properties.order_id` | `order_id` | Promoted out of dynamic map |

`insert_date` is not inserted — ClickHouse fills it via `DEFAULT toDate(received_at)`.

### Dynamic columns

All remaining `properties` keys → `Nullable(String)` columns:
- Dicts / lists → `json.dumps(value)`
- Scalars → `str(value)`
- `None` → SQL `NULL`

---

## Stage 8: ClickHouse Insert

**[writer.py:172](app/writer.py#L172)**

```python
await self._client.insert(table, rows, column_names=column_names)
```

Batch insert of all rows for the `project_id` in one call. Column order: base columns (fixed) + sorted dynamic columns.

---

## Stage 9: User Profile Update (async, non-blocking)

**[profile_updater.py:17–75](app/profile_updater.py#L17-L75)**

For specific event types defined in `profile_mapping.py` (e.g. `email_verified` → `email` field), extracts mapped properties and upserts into MongoDB `user_profiles`. Exceptions are caught and logged — profile update failures do **not** block the batch commit.

---

## Error Handling

| Failure | Behavior |
|---|---|
| Bad JSON from Kafka | Dropped, warning logged, batch continues |
| ClickHouse write fails | Retry up to 3× with exponential backoff (1 s → 2 s → 4 s) |
| All 3 retries exhausted | Batch sent to DLQ `pam.events.invalid.v1` |
| Profile update fails | Logged, batch still commits |
| Kafka offset commit | Only after successful ClickHouse write **or** DLQ hand-off |

### Retry loop (`_write_with_retry`)

**[consumer.py:17–40](app/consumer.py#L17-L40)**

```
attempt 0 → fail → sleep 1 s
attempt 1 → fail → sleep 2 s
attempt 2 → fail → send to DLQ
```

### Dead-Letter Queue

**[consumer.py:43–59](app/consumer.py#L43-L59)**

DLQ producer uses `acks="all"` — waits for replication before confirming. Key per message = `event.get("user_id")` for partition balance.

---

## Idempotency

Two complementary layers prevent duplicates reaching ClickHouse:

| Layer | Mechanism | Window |
|---|---|---|
| Redis dedup (Stage 3) | `SET NX EX` on `event_id` | 24 hours |
| `ReplacingMergeTree(received_at)` | ClickHouse engine deduplicates at merge time | Indefinite |

Kafka offset commit discipline (at-least-once) means an event can be reprocessed if the consumer crashes after a write. Both layers handle re-arrivals safely.

---

## Full Flow Summary

```
Kafka topic: pam.events.raw.v1
    │
    ├─ [1] Consume batch (≤500 msgs, ≤5 s)
    ├─ [2] Group by project_id
    │
    └─ For each project_id group:
        ├─ [3] Dedup via Redis (drop seen event_ids)
        ├─ [4] Resolve field aliases (MongoDB-cached)
        ├─ [5] Bootstrap table if new project_id
        ├─ [6] Ensure all property columns exist (Redis lock + ALTER TABLE)
        ├─ [7] Transform events → row lists
        ├─ [8] INSERT into pam.events_{project_id}
        └─ [9] Upsert user profiles in MongoDB (non-blocking)
            │
            └─ On success: commit Kafka offset
               On failure: retry × 3 → DLQ → commit Kafka offset
```
