# Segmentation Engine — Workflows

---

## 1. Segment Creation

```
Admin → POST /v1/segments
  │
  ├─ Pydantic validates the DSL (filter types, time window, event names)
  ├─ Checks segment_id doesn't already exist in MongoDB
  ├─ Persists to `segments` collection (size: null, computed_at: null)
  └─ If refresh_strategy = "scheduled" → registers APScheduler cron job
     If refresh_strategy = "on_event"  → no cron, Kafka consumer handles it

Returns 201. Segment exists but has no members yet.
```

---

## 2. Scheduled Refresh

```
APScheduler fires cron (e.g. "0 */6 * * *")
  │
  ├─ Compiles DSL → ClickHouse SQL + MongoDB queries
  ├─ Runs ClickHouse queries → set of user_ids (event filters, did_not_do)
  ├─ Runs MongoDB queries → set of user_ids (trait filters, in_segment)
  ├─ Intersects or unions all sets (match: "all" or "any")
  │
  ├─ Clears old segment_memberships for this segment
  ├─ Bulk-upserts new user_ids into segment_memberships
  ├─ Updates segments.size and segments.computed_at
  └─ Invalidates Redis cache for all affected users
```

---

## 3. Event-Driven Refresh

```
api-service publishes event → pam.events.raw.v1 (Kafka)
  │
  ├─ segmentation-engine consumer (group: segmentation-trigger) picks it up
  ├─ Extracts project_id, user_id, event_name from the message
  ├─ Queries MongoDB: which on_event segments reference this event_name?
  │
  └─ For each matching segment:
      ├─ Re-evaluates ONLY this one user (not the full segment)
      ├─ Runs ClickHouse + MongoDB queries filtered to user_id
      ├─ If user qualifies → upsert into segment_memberships
      ├─ If user doesn't qualify → remove from segment_memberships
      └─ Invalidate Redis cache for this user

  └─ Commits Kafka offset only after all writes succeed
```

---

## 4. Manual Evaluation

```
Admin → POST /v1/segments/{segment_id}/evaluate
  │
  ├─ Fetches segment definition from MongoDB
  ├─ Runs full evaluate_segment() — same logic as scheduled refresh
  │   ├─ ClickHouse queries for event filters
  │   ├─ MongoDB queries for trait filters
  │   └─ Intersects/unions results
  │
  ├─ Clears old memberships, bulk-upserts new ones
  ├─ Updates size + computed_at
  └─ Invalidates Redis cache

Returns 202 with { segment_id, size, computed_at }.
```

---

## 5. Segment Deletion

```
Admin → DELETE /v1/segments/{segment_id}
  │
  ├─ Checks segment exists — 404 if not
  ├─ Deletes document from `segments` collection
  ├─ Deletes ALL documents for this segment from `segment_memberships`
  └─ Unregisters APScheduler cron job (if scheduled strategy)

Returns 204. No Redis invalidation needed — cache entries
expire naturally via TTL.
```

---

## Key Pattern

MongoDB is always the source of truth. Redis is a read-through cache invalidated on any membership change.
Kafka offsets are committed only after writes complete — no partial state.
