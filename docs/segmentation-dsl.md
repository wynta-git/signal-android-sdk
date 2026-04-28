# Segmentation DSL

Defines how users describe segments. The `segmentation-engine` compiles this DSL into ClickHouse SQL and MongoDB queries.

## Goals

- Expressive enough for "users who did X at least N times in the last D days, AND have trait Y"
- Safe — no raw SQL from users
- Versioned — segment definitions are forward-compatible

## DSL shape (JSON)

```json
{
  "version": 1,
  "match": "all" | "any",
  "filters": [
    /* one or more filter clauses */
  ]
}
```

## Filter clauses

### Event filter
"User did event X (with property constraints) Y times in the last D days."

```json
{
  "type": "event",
  "event_name": "purchase_completed",
  "where": {
    "amount": { "op": "gte", "value": 100 },
    "currency": { "op": "eq", "value": "USD" }
  },
  "frequency": { "op": "gte", "count": 3 },
  "time_window": { "last_days": 30 }
}
```

Operators supported on event properties:
- `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `contains`, `starts_with`, `exists`

### Trait filter
"User has trait T with constraint."

```json
{
  "type": "trait",
  "trait": "plan",
  "op": "eq",
  "value": "pro"
}
```

### Negation
"User did NOT do X in the last D days."

```json
{
  "type": "did_not_do",
  "event_name": "app_opened",
  "time_window": { "last_days": 7 }
}
```

### Membership in another segment
"User is also in segment S."

```json
{ "type": "in_segment", "segment_id": "seg_active_buyers" }
```

## Top-level combinators

- `match: "all"` → AND of filters
- `match: "any"` → OR of filters

Nested groups are not supported in v1. If you need `(A AND B) OR C`, split into multiple segments.

## Examples

### "Active buyers in the last 30 days"
```json
{
  "version": 1,
  "match": "all",
  "filters": [
    {
      "type": "event",
      "event_name": "purchase_completed",
      "frequency": { "op": "gte", "count": 1 },
      "time_window": { "last_days": 30 }
    }
  ]
}
```

### "Pro users who haven't opened the app in a week"
```json
{
  "version": 1,
  "match": "all",
  "filters": [
    { "type": "trait", "trait": "plan", "op": "eq", "value": "pro" },
    {
      "type": "did_not_do",
      "event_name": "app_opened",
      "time_window": { "last_days": 7 }
    }
  ]
}
```

## Compilation strategy

- Event filters → ClickHouse `SELECT user_id FROM pam.events WHERE ... GROUP BY user_id HAVING count() >= N`
- Trait filters → MongoDB `users` collection match
- `did_not_do` → ClickHouse anti-join (set difference)
- `in_segment` → MongoDB `segment_memberships` lookup
- Combine with intersection (`all`) or union (`any`) of `user_id` sets

## Refresh strategies

- `on_event`: re-evaluate user-level membership when matching events arrive (cheap, near-real-time).
- `scheduled`: full recompute on cron (e.g. `0 */6 * * *`). Used for time-window-heavy segments.

Both write to `segment_memberships`. Campaigns read from there.

## Limits

- Max 10 filters per segment in v1.
- Max time window: 365 days.
- Max segments per project: 1000.
