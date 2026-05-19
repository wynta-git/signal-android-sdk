# MongoDB Collections

Database: `pam`

## Collections and owners

| Collection | Owner (writes) | Read by | Purpose |
|---|---|---|---|
| `projects` | api-service | all | Project metadata, API keys (hashed), settings. |
| `event_routes` | ops/admin | api-service | Topic-centric fanout rules: which event names fan out to which extra Kafka topics. |
| `tokens` | api-service | api-service only | API tokens (hashed). Status: active / revoked. |
| `users` | api-service (`/v1/identify`) | segmentation-engine, campaign-engine, notifications-engine | User profiles. Identified ids, traits, last_seen. |
| `anonymous_to_user` | api-service (`/v1/identify`) | api-service | Mapping from anonymous device id → user_id (set by `/v1/identify`). |
| `segments` | segmentation-engine | campaign-engine | Segment definitions and metadata. |
| `segment_memberships` | segmentation-engine | campaign-engine | `{segment_id, user_id, joined_at}`. |
| `campaigns` | campaign-engine | notifications-engine | Campaign definitions, schedule, audience, channel, template. |
| `campaign_runs` | campaign-engine | notifications-engine | Each execution of a campaign. |
| `notification_templates` | campaign-engine | notifications-engine | Push / email / SMS / webhook templates. |
| `notification_deliveries` | notifications-engine | analytics | Per-user, per-campaign delivery status. |

## Schemas

### `event_routes`
```js
{
  _id: ObjectId,
  topic: "pam.bonus.v1",                          // the extra Kafka topic to fan out to
  event_names: ["bonus_award", "purchase"],        // events that should be sent to this topic
  description: "optional human-readable label",
  created_at: ISODate,
  updated_at: ISODate
}
// Indexes: { topic: 1 } unique
// Add an event to a topic:   $push event_names
// Remove an event from topic: $pull event_names
```

### `projects`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",        // public id
  name: "Acme Mobile",
  created_at: ISODate,
  settings: {
    pii_salt: "<random, never expose>",
    timezone: "Asia/Kolkata",
    retention_months: 13
  }
}
// Indexes: { project_id: 1 } unique
```

### `tokens`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  token_hash: "<sha256>",           // never store raw token
  scope: ["events:write"],          // or "admin"
  status: "active",                 // or "revoked"
  created_at: ISODate,
  last_used_at: ISODate,
  revoked_at: ISODate | null
}
// Indexes: { token_hash: 1 } unique, { project_id: 1, status: 1 }
```

### `users`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  user_id: "user_42",
  anonymous_ids: ["anon_xxx", "anon_yyy"],
  traits: {
    email_hash: "<sha256>",
    phone_hash: "<sha256>",
    name: "Asha",                   // non-PII traits OK to store raw
    plan: "pro"
  },
  first_seen_at: ISODate,
  last_seen_at: ISODate
}
// Indexes:
//   { project_id: 1, user_id: 1 } unique
//   { project_id: 1, "traits.email_hash": 1 }
//   { project_id: 1, last_seen_at: -1 }
```

### `segments`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  segment_id: "seg_active_buyers",
  name: "Active buyers (30d)",
  rule: { /* DSL — see docs/segmentation-dsl.md */ },
  refresh_strategy: "on_event" | "scheduled",
  scheduled_cron: "0 */6 * * *",    // if scheduled
  size: 12345,                       // last computed size
  computed_at: ISODate
}
// Indexes: { project_id: 1, segment_id: 1 } unique
```

### `segment_memberships`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  segment_id: "seg_active_buyers",
  user_id: "user_42",
  joined_at: ISODate
}
// Indexes:
//   { project_id: 1, segment_id: 1, user_id: 1 } unique
//   { project_id: 1, user_id: 1 }    // for "what segments is this user in?"
```

### `campaigns`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  campaign_id: "camp_xyz",
  name: "Re-engage dormant users",
  status: "draft" | "scheduled" | "running" | "paused" | "completed",
  trigger: {
    type: "event" | "scheduled" | "one_off",
    event_name: "purchase_completed", // if type=event
    cron: "...",                       // if type=scheduled
  },
  audience: { segment_id: "seg_xxx" } | { all: true },
  channel: "push" | "email" | "sms" | "webhook",
  template_id: "tmpl_abc",
  rate_limit: { per_user_per_day: 1 },
  created_at: ISODate,
  updated_at: ISODate
}
// Indexes:
//   { project_id: 1, campaign_id: 1 } unique
//   { project_id: 1, status: 1 }
```

### `notification_deliveries`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  campaign_id: "camp_xyz",
  campaign_run_id: ObjectId,
  user_id: "user_42",
  channel: "push",
  status: "queued" | "sent" | "failed" | "opened" | "clicked",
  provider: "fcm",
  provider_msg_id: "...",
  attempted_at: ISODate,
  finalized_at: ISODate,
  error: null | { code, message }
}
// Indexes:
//   { project_id: 1, campaign_id: 1, user_id: 1 }
//   { project_id: 1, status: 1, attempted_at: -1 }
//   TTL on attempted_at after 90 days
```

### `col_maps`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  col_map: {
    "My Price$": "my_price_",   // raw SDK key → sanitized ClickHouse column name
    "currency":  "currency"
  },
  updated_at: ISODate
}
// Indexes: { project_id: 1 } unique
// Owner: event-processor (writes). Read by: event-processor (Redis warm-up), segmentation-engine (fallback).
// Never TTL'd — mapping is permanent once written.
```

### `field_aliases`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  event_name: "deposit_event",
  aliases: {
    "deposit_amount": "amount",   // source field → canonical field
    "txn_currency":  "currency"
  },
  created_at: ISODate,
  updated_at: ISODate
}
// Indexes: { project_id: 1, event_name: 1 } unique
// Owner: api-service admin API (writes). Read by: event-processor (30s in-memory cache),
//        segmentation-engine (query-time col_map enrichment, meta property discovery).
// canonical field can be a base column (amount, currency, order_id) or any dynamic column name.
// Alias wins on conflict: if both source and canonical arrive in the same event, source value is used.
```

## Conventions

- Always include `project_id` in queries — multi-tenant isolation.
- Public ids (`user_id`, `segment_id`, `campaign_id`) are strings, prefixed (`user_`, `seg_`, `camp_`).
- `_id` ObjectIds are internal only. Do not expose in APIs.
- Use `motor` (async) — no sync `pymongo` in request paths.
