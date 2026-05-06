# MongoDB Collections

Database: `pam`

## Collections and owners

| Collection | Owner (writes) | Read by | Purpose |
|---|---|---|---|
| `projects` | api-service | all | Project metadata, API keys (hashed), settings. |
| `tokens` | api-service | api-service only | API tokens (hashed). Status: active / revoked. |
| `users` | event-processor | segmentation-engine, campaign-engine, notifications-engine | User profiles. Identified ids, traits, last_seen. |
| `anonymous_to_user` | event-processor | event-processor | Mapping from anonymous device id → user_id (set by `user_identified`). |
| `segments` | segmentation-engine | campaign-engine | Segment definitions and metadata. |
| `segment_memberships` | segmentation-engine | campaign-engine | `{segment_id, user_id, joined_at}`. |
| `campaigns` | campaign-engine | notifications-engine | Campaign definitions, schedule, audience, channel, template. |
| `campaign_runs` | campaign-engine | notifications-engine | Each execution of a campaign. |
| `notification_templates` | campaign-engine | notifications-engine | Push / email / SMS / webhook templates. |
| `notification_deliveries` | notifications-engine | analytics | Per-user, per-campaign delivery status. |

## Schemas

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

## Conventions

- Always include `project_id` in queries — multi-tenant isolation.
- Public ids (`user_id`, `segment_id`, `campaign_id`) are strings, prefixed (`user_`, `seg_`, `camp_`).
- `_id` ObjectIds are internal only. Do not expose in APIs.
- Use `motor` (async) — no sync `pymongo` in request paths.
