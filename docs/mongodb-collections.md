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
| `derived_rules` | segmentation-engine admin API | segmentation-engine (query-time) | Admin-authored SQL templates for derived segment rules. |
| `trait_schemas` | shared (`upsert_user_profile`) | segmentation-engine | Per-project trait type registry. Written on first trait occurrence, locked after. |
| `campaigns` | campaign-engine | notifications-engine | Campaign definitions, schedule, audience, channel, template. |
| `campaign_runs` | campaign-engine | notifications-engine | Each execution of a campaign. |
| `notification_templates` | campaign-engine | notifications-engine | Push / email / SMS / webhook templates. |
| `notification_deliveries` | notifications-engine | analytics | Per-user, per-campaign delivery status. |
| `device_tokens` | api-service | notifications-engine | Push device tokens (FCM/APNs) per user. |
| `dashboard_boosts` | campaign-engine admin API | campaign-engine | Per-project additive offsets applied to dashboard summary counts. |

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
  brand_id: "brand_1" | null,       // null = project-wide (no brand scoping)
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
//   { project_id: 1, brand_id: 1, user_id: 1 } unique
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
  created_by: "alice" | null,        // free-form label set at creation time
  members_count: 12345,              // last computed membership size (null until first run)
  last_refresh_time: ISODate         // when members_count was last updated (null until first run)
}
// Indexes: { project_id: 1, segment_id: 1 } unique
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
  send_id: "...",               // from pam.campaigns.send.v1; combined with token_hash for dedup
  token_hash: "...",            // sha256 of device token (push) or "" for other channels
  project_id: "proj_abc123",
  campaign_id: "camp_xyz",
  campaign_run_id: "...",
  user_id: "user_42",
  channel: "push",
  status: "sent" | "failed" | "suppressed",
  provider: "fcm_stub" | "apns_stub",
  provider_msg_id: "...",
  attempted_at: ISODate,
  error: null | { code: str, message: str }
}
// Indexes:
//   { project_id: 1, campaign_id: 1, user_id: 1 }
//   { project_id: 1, status: 1, attempted_at: -1 }
//   { send_id: 1, token_hash: 1 } unique  ← idempotency key
//   TTL on attempted_at after 90 days
```

### `device_tokens`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  brand_id: "brand_1" | null,       // null = project-wide; mirrors the user's brand_id
  user_id: "user_42",
  token: "<FCM registration token or APNs device token>",
  platform: "android" | "ios" | "web",
  created_at: ISODate
}
// Indexes: { project_id: 1, brand_id: 1, user_id: 1 }  (non-unique — one user, many tokens)
// Owner: api-service (SDK registers tokens). Read by: notifications-engine.
```

### `trait_schemas`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  trait: "level",
  type: "number",        // "number" | "string" | "boolean" | "datetime"
  created_at: ISODate    // when this trait was first seen
}
// Indexes: { project_id: 1, trait: 1 } unique
// Owner: shared upsert_user_profile() — written on first trait occurrence via $setOnInsert (type locked after).
// Read by: segmentation-engine for /traits/{trait_name}/operators.
// Falls back to sampling users collection for traits written before this collection existed.
```

### `derived_rules`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  rule_id: "high_value_tier_reached",      // slug, unique per project
  name: "High Value Tier Reached",
  sql: "SELECT user_id FROM pam.events_{project_id} WHERE ...",
  parameters: [
    { key: "threshold", type: "number" }   // only "number" type supported
  ],
  created_at: ISODate,
  updated_at: ISODate
}
// Indexes: { project_id: 1, rule_id: 1 } unique
// Owner: segmentation-engine admin API (SystemAuthDep — internal only).
// SQL substitution: {project_id} injected by engine; parameter keys substituted after type validation.
// Only "number" parameter type is supported to prevent SQL injection via user-supplied values.
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

### `brand_settings`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  brand_id: "brand_01",
  fcm_service_account_json: "<stringified JSON>",  // FCM service account for this brand
  created_at: ISODate,
  updated_at: ISODate
}
// Indexes: { project_id: 1, brand_id: 1 } unique
// Owner: campaign-engine settings API (writes). Read by: notifications-engine.
// Falls back to projects.settings.fcm_service_account_json if no brand-specific credential found.
```

### `dashboard_boosts`
```js
{
  _id: ObjectId,
  project_id: "proj_abc123",
  boosts: {
    "quick_stats.reachable_players": 1000,   // additive offset; omit field to apply no boost
    "quick_stats.messages_sent": 5000,
    "player_health.total_users": 2000,
    // supported keys: quick_stats.{reachable_players,active_this_week,live_campaigns,
    //   active_segments,messages_sent}, player_health.{total_users,new,healthy,at_risk,churned},
    //   channel_optin.{push,email,sms}
  },
  updated_at: ISODate
}
// Indexes: { project_id: 1 } unique
// Owner: campaign-engine admin API (PUT /dashboard/boosts). Read by: campaign-engine (GET /summary).
// delivery_rate is intentionally excluded — it's a ratio; boosting numerator alone would distort it.
```

## Conventions

- Always include `project_id` in queries — multi-tenant isolation.
- Public ids (`user_id`, `segment_id`, `campaign_id`) are strings, prefixed (`user_`, `seg_`, `camp_`).
- `_id` ObjectIds are internal only. Do not expose in APIs.
- Use `motor` (async) — no sync `pymongo` in request paths.
