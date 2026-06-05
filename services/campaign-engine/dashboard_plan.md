# Dashboard API — Implementation Plan

## Context

The business team has shared a dashboard mockup (PAM/MoEngage-style) showing campaign, segment, channel, and player health metrics. The goal is to build backend APIs that power this dashboard. No analytics service exists today. The plan maximises reuse of existing data already in MongoDB (`campaigns`, `campaign_runs`, `notification_deliveries`, `segments`, `users`, `device_tokens`) and avoids a new microservice by adding a `dashboard` router to campaign-engine, which already has MongoDB access to all relevant collections.

---

## Data Availability Audit

### ✅ Fully available (existing MongoDB data)

| Dashboard Widget | Source Collection | Query |
|---|---|---|
| Live Campaigns count | `campaigns` | status in ["running", "scheduled"] |
| Active Segments count | `segments` | count all for project |
| Messages Sent (7d / MTD) | `notification_deliveries` | status="sent", attempted_at filter |
| Delivery Rate per channel | `notification_deliveries` | sent ÷ (sent+failed) grouped by channel |
| Channel message counts (7d) | `notification_deliveries` | grouped by channel |
| Daily sent trend (sparkline) | `notification_deliveries` | group by date + channel |
| Campaign list (name, channel, status) | `campaigns` | list with status filter |
| Total sent per campaign | `campaign_runs` | sum sent_count grouped by campaign_id |
| Segment list + member counts | `segments` | members_count field |
| Player Segments breakdown (%) | `segments` | members_count / total |
| Total users / Reachable Players | `users` + `device_tokens` | distinct user_ids |
| New players (MTD) | `users` | first_seen_at >= month_start |
| Opted-in to Push | `device_tokens` | distinct user_id count |
| Opted-in to Email | `users` | traits.email_hash $exists |
| Opted-in to SMS | `users` | traits.phone_hash $exists |
| Active This Week (approx) | `users` | last_seen_at >= 7d ago |
| Healthy / At-Risk / Churned (approx) | `users` | last_seen_at buckets: 7d / 30–90d / 90d+ |

### ⚠️ Approximated (not exact, noted in API response)

| Metric | Approximation | Exact requires |
|---|---|---|
| Active This Week | `users.last_seen_at` ≥ 7d ago (only updated on `/identify`) | ClickHouse events query |
| Player health buckets | `last_seen_at` time buckets | ClickHouse events query |
| Channel "status" (Live/Paused) | `running` campaign exists for that channel = Live | Per-channel config flag |

### ❌ Not available (not tracked in current system)

| Widget | Why missing | Path to add later |
|---|---|---|
| Open Rate | No opened_at in notification_deliveries; needs provider webhook callbacks | Add FCM/SES delivery receipts |
| Click-through Rate / Click-throughs | No click tracking | Add deep-link click callbacks |
| Opt-outs (7d) / Unsubscribe Rate | Redis suppression keys not counted | Add opt-out event to ClickHouse |
| Player Responses | Undefined concept in current data model | Define + track |
| Churn Prevented | Not a tracked metric | Business logic definition needed |
| Re-engagement Rate / Win-back Success | Not tracked | Requires cohort analysis |
| WhatsApp / Telegram opted-in count | Not current channels in system | Add channel opt-in tracking |
| Conversions | Not tracked | Define conversion event |

For all unavailable metrics the API returns `null` with a `"tracked": false` flag.

---

## Architecture

Add a `dashboard` router to **campaign-engine** — it already has MongoDB access to all needed collections in the `pam` database. No new service, no new dependencies.

- New file: `services/campaign-engine/app/routes/dashboard.py`
- Register in: `services/campaign-engine/app/main.py`
- Shared helpers in: `shared/clients/mongo.py`

**Auth:** `PortalAuthDep` (same as all other campaign-engine routes).

---

## Endpoints

All under `/api/v1/campaign/projects/{project_id}/dashboard/`

### 1. Summary
```
GET /summary
```
Returns: quick_stats, player_health, channel_optin

**Query params:** `window_days` (default 7)

**Response:**
```json
{
  "window_days": 7,
  "quick_stats": {
    "reachable_players":   { "value": 57210, "change_pct": 6.8 },
    "active_this_week":    { "value": 3481,  "change_pct": 8.2, "approximate": true },
    "live_campaigns":      { "value": 7 },
    "active_segments":     { "value": 12 },
    "messages_sent_7d":    { "value": 126840, "change_pct": 18.3 },
    "delivery_rate_7d":    { "value": 0.951 },
    "open_rate":           { "value": null, "tracked": false },
    "ctr":                 { "value": null, "tracked": false },
    "opt_outs_7d":         { "value": null, "tracked": false },
    "player_responses_7d": { "value": null, "tracked": false }
  },
  "player_health": {
    "approximate": true,
    "total_users": 159000,
    "new":     { "count": 9540,  "pct": 0.06 },
    "healthy": { "count": 116070, "pct": 0.73 },
    "at_risk": { "count": 27030, "pct": 0.17 },
    "churned": { "count": 17490, "pct": 0.11 },
    "at_risk_contacted_pct": null,
    "reengagement_rate":     null,
    "winback_success_rate":  null
  },
  "channel_optin": {
    "push":  { "count": 38900 },
    "email": { "count": 48210, "approximate": true },
    "sms":   { "count": 21400, "approximate": true }
  }
}
```

---

### 2. Channels
```
GET /channels
```
Returns: per-channel status, messages sent, delivery rate, 7-day trend sparkline

**Query params:** `window_days` (default 7)

**Response:**
```json
{
  "window_days": 7,
  "channels": [
    {
      "channel": "push",
      "opted_in_users": 38900,
      "reach_pct": 0.62,
      "status": "live",
      "messages_sent": 82100,
      "delivery_rate": 0.941,
      "open_rate": null,
      "ctr": null,
      "trend_7d": [
        { "date": "2026-05-30", "sent": 11200, "failed": 650 }
      ]
    }
  ]
}
```

`status` is `"live"` if any campaign with that channel is in `running` or `scheduled` state, otherwise `"paused"`.

---

### 3. Segments
```
GET /segments
```
Returns: paginated segments sorted by members_count desc, with % of total

**Query params:** `limit` (default 10, max 100), `offset` (default 0), `brand_id`

**Response:**
```json
{
  "total": 12,
  "limit": 10,
  "offset": 0,
  "total_members_across_segments": 84200,
  "segments": [
    { "segment_id": "seg_vip", "name": "VIP Players", "members_count": 22100, "pct": 0.26 }
  ]
}
```

---

### 4. Campaigns
```
GET /campaigns
```
Returns: paginated live campaigns with sent count, sorted by total_sent desc

**Query params:** `limit` (default 10, max 100), `offset` (default 0), `status` (default: running,scheduled), `brand_id`

**Response:**
```json
{
  "total": 7,
  "limit": 10,
  "offset": 0,
  "campaigns": [
    {
      "campaign_id": "camp_001",
      "name": "Weekend Bonus Push",
      "channel": "push",
      "segment_id": "seg_dep",
      "segment_name": "Active Depositors",
      "total_sent": 45200,
      "status": "running",
      "open_rate": null,
      "ctr": null,
      "click_throughs": null
    }
  ]
}
```

---

### 5. Analytics
```
GET /analytics
```
Returns: daily sent chart data + MTD report numbers

**Query params:** `window_days` (default 30)

**Response:**
```json
{
  "window_days": 30,
  "daily": [
    { "date": "2026-05-07", "sent": 12400, "failed": 620 }
  ],
  "mtd": {
    "messages_sent":     { "value": 412800, "change_pct": 14.2 },
    "avg_delivery_rate": { "value": 0.965 },
    "avg_open_rate":     { "value": null, "tracked": false },
    "avg_ctr":           { "value": null, "tracked": false }
  }
}
```

---

## MongoDB Queries

```python
# Delivery stats — single aggregation reused by /summary, /channels, /analytics
db.notification_deliveries.aggregate([
  {"$match": {"project_id": pid, "attempted_at": {"$gte": since, "$lte": until}}},
  {"$group": {
    "_id": {
      "channel": "$channel",
      "status": "$status",
      "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$attempted_at"}}
    },
    "count": {"$sum": 1}
  }}
])

# Campaign sent totals — join campaign list with campaign_runs
db.campaign_runs.aggregate([
  {"$match": {"project_id": pid, "campaign_id": {"$in": campaign_ids}}},
  {"$group": {"_id": "$campaign_id", "total_sent": {"$sum": "$sent_count"}}}
])

# User health buckets
# new:     first_seen_at >= now - 30d
# healthy: last_seen_at  >= now - 30d
# at_risk: last_seen_at in [now-90d, now-30d]
# churned: last_seen_at < now - 90d

# Channel opt-in
db.device_tokens.aggregate([{"$match": {"project_id": pid}}, {"$group": {"_id": "$user_id"}}])  # push
db.users.count_documents({"project_id": pid, "traits.email_hash": {"$exists": True, "$ne": None}})
db.users.count_documents({"project_id": pid, "traits.phone_hash": {"$exists": True, "$ne": None}})

# Reachable players
db.users.count_documents({"project_id": pid, "$or": [
  {"traits.email_hash": {"$exists": True}},
  {"traits.phone_hash": {"$exists": True}}
]})
# union with push device_token distinct users (in app layer)
```

---

## Files to Create / Modify

| File | Action | What |
|---|---|---|
| `services/campaign-engine/app/routes/dashboard.py` | **Create** | 5 route handlers + all aggregation logic |
| `services/campaign-engine/app/main.py` | **Edit** | Register dashboard_router |
| `shared/clients/mongo.py` | **Edit** | Add `get_dashboard_delivery_stats()`, `get_dashboard_user_health()`, `get_dashboard_channel_optin()` |

---

## Reused Code

- `shared/clients/mongo.py`: `make_mongo_client()`, `list_campaigns()`, `list_campaign_runs()`
- `services/campaign-engine/app/deps.py`: `PortalAuthDep`, `get_db()`

---

## Verification

1. Start campaign-engine: `cd services/campaign-engine && uv run uvicorn app.main:app --reload`
2. Call each of the 5 endpoints with a valid JWT
3. Verify `null + "tracked": false` for open_rate, ctr on all endpoints
4. Cross-check `messages_sent` on `/summary` vs direct MongoDB count on `notification_deliveries`
5. Verify `/segments` total matches segment count from `GET /api/v1/segments`
6. Verify `/campaigns` total matches campaign count from `GET /api/v1/campaign/projects/{project_id}`
7. Verify player_health counts sum to total_users
