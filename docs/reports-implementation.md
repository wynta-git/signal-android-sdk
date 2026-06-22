# Reports Implementation Reference

Covers the three main analytics report endpoints in `services/campaign-engine/app/routes/reports.py`.
Each data point is listed with its meaning, implementation status, and data source.

---

## 1. Campaign Stats — `GET /projects/{project_id}/reports/campaign-stats`

### Summary

| Field | What it means | Status | Source |
|---|---|---|---|
| `total_sent.value` | Total messages sent across all channels in the window | ✅ | MongoDB `notification_deliveries` via `get_dashboard_delivery_stats`, status = `sent` |
| `total_sent.change_pct` | % change vs previous equal-length window | ✅ | Same query run twice (curr/prev window), `_change_pct()` |
| `avg_open_rate.value` | Opens ÷ sent across all campaigns | ✅ | ClickHouse: `countIf(event_name = 'notification_opened')` ÷ `total_sent` |
| `avg_open_rate.tracked` | Whether any notification events exist in ClickHouse | ✅ | `bool(ch_events_by_campaign)` |
| `avg_ctr.value` | Clicks ÷ sent across all campaigns | ✅ | ClickHouse: `countIf(event_name = 'notification_clicked')` ÷ `total_sent` |
| `avg_ctr.tracked` | Whether any notification events exist in ClickHouse | ✅ | `bool(ch_events_by_campaign)` |
| `conversions.value` | Unique users who made a `deposit_success` within 24 h of a notification open/click | ✅ | ClickHouse last-touch attribution query in `_query_conversions_by_campaign` |
| `conversions.tracked` | Whether any attribution data exists | ✅ | `bool(conversions_by_campaign)` |
| `revenue_influenced.value` | Sum of `amount` from attributed `deposit_success` events | ✅ | Same ClickHouse attribution query |
| `revenue_influenced.tracked` | Whether any attribution data exists | ✅ | `bool(conversions_by_campaign)` |

### Trend

Daily breakdown of messages sent, split into three channel tiers.

| Field | What it means | Status | Source |
|---|---|---|---|
| `trend[].date` | Date string (YYYY-MM-DD) for each day in the window | ✅ | Computed from `since` + `window_days` |
| `trend[].primary` | Daily sent count for **email** | ✅ | Aggregated from `get_dashboard_delivery_stats` delivery buckets |
| `trend[].secondary` | Daily sent count for **push** | ✅ | Same |
| `trend[].tertiary` | Daily sent count for **sms** | ✅ | Same |

### Per-Campaign Table

| Field | What it means | Status | Source |
|---|---|---|---|
| `campaign_id` | Campaign identifier | ✅ | MongoDB `campaigns` |
| `name` | Campaign name | ✅ | MongoDB `campaigns` |
| `channel` | Delivery channel (email / push / sms / …) | ✅ | MongoDB `campaigns` |
| `status` | Campaign status (running / scheduled / paused / completed) | ✅ | MongoDB `campaigns` |
| `sent` | Total messages sent for this campaign (all time) | ✅ | MongoDB `campaign_runs`, sum of `sent_count` grouped by `campaign_id` |
| `open_rate` | Opens ÷ sent for this campaign | ✅ | ClickHouse `_query_notification_events_by_campaign`, opens ÷ `sent` |
| `ctr` | Clicks ÷ sent for this campaign | ✅ | Same ClickHouse query, clicks ÷ `sent` |
| `conversions` | Attributed unique depositors for this campaign | ✅ | ClickHouse `_query_conversions_by_campaign`, `null` if no ClickHouse data |
| `revenue_influenced` | Sum of attributed deposit amounts for this campaign | ✅ | Same attribution query, `null` if no ClickHouse data |

---

## 2. Channel Delivery — `GET /projects/{project_id}/reports/channel-delivery`

### Summary

| Field | What it means | Status | Source |
|---|---|---|---|
| `total_messages.value` | Total messages sent (all channels) in the window | ✅ | MongoDB `notification_deliveries`, status = `sent` |
| `total_messages.change_pct` | % change vs previous equal-length window | ✅ | `_change_pct(curr_sent, prev_sent)` |
| `delivery_rate.value` | Sent ÷ (sent + failed) | ✅ | `_safe_rate(curr_sent, curr_sent + curr_failed)` |
| `bounce_rate.value` | Failed ÷ (sent + failed) | ✅ | `_safe_rate(curr_failed, curr_sent + curr_failed)` |
| `opt_outs_7d.value` | Total opt-outs across all channels in the window | ✅ | MongoDB `daily_boosts`, sums `opt_outs` field across days in window |
| `opt_outs_7d.tracked` | Whether any opt-out data was found | ✅ | `opt_outs_total > 0` |
| `active_channels.value` | Number of channels with at least one sent message | ✅ | Count of channels in delivery buckets with `sent > 0` |
| `active_channels.paused` | Number of known channels with no messages sent | ✅ | `len(_ALL_CHANNELS) - active_set` |

### Trend

Same structure as campaign-stats trend — daily sent counts by channel tier.

| Field | Status | Source |
|---|---|---|
| `trend[].date` | ✅ | Computed date range |
| `trend[].primary` (email) | ✅ | Delivery buckets |
| `trend[].secondary` (push) | ✅ | Delivery buckets |
| `trend[].tertiary` (sms) | ✅ | Delivery buckets |

### Per-Channel Table

| Field | What it means | Status | Source |
|---|---|---|---|
| `channel` | Channel name | ✅ | Keyed from delivery buckets |
| `messages` | Total sent + failed for this channel | ✅ | Delivery buckets |
| `delivery_rate` | Sent ÷ total for this channel | ✅ | `_safe_rate(ch_sent, ch_total)` |
| `bounce_rate` | Failed ÷ total for this channel | ✅ | `_safe_rate(ch_failed, ch_total)` |
| `open_rate` | Opens ÷ sent for this channel | ✅ | ClickHouse `_query_notification_events` grouped by channel |
| `ctr` | Clicks ÷ sent for this channel | ✅ | Same ClickHouse query |
| `opt_outs` | Opt-outs for this specific channel | ❌ **always null** | Needs a `notification_unsubscribed` event with a `channel` property flowing through ClickHouse. No such event exists in the event schema yet. |

---

## 3. Segment Analysis — `GET /projects/{project_id}/reports/segment-analysis`

### Summary

| Field | What it means | Status | Source |
|---|---|---|---|
| `total_segments.value` | Count of all segments for the project | ✅ | MongoDB `segments`, count of all docs |
| `reachable_users.value` | Sum of `members_count` across all segments | ✅ | MongoDB `segments`, sum of `members_count` |
| `avg_segment_size.value` | Average `members_count` across segments with a non-null count | ✅ | `reachable_users ÷ len(non_null_segments)` |
| `opt_in_rate.value` | Push-opted-in users ÷ total users | ✅ | MongoDB: `device_tokens` distinct user count ÷ `users` count |
| `opt_in_rate.tracked` | Whether `opt_in_rate` could be calculated | ✅ | `opt_in_rate is not None` |
| `segment_growth.value` | % growth in total reachable users vs prior window | ❌ **always null** | Needs a `segment_snapshots` collection with periodic `members_count` writes. See below. |

### Trend

| Field | What it means | Status | Source |
|---|---|---|---|
| `trend[].date` | Date string for each day in the window | ✅ | Computed date range |
| `trend[].primary` | Members count for largest segment | ⚠️ **flat/fake** | Current `members_count` repeated for every day — no historical data |
| `trend[].secondary` | Members count for 2nd-largest segment | ⚠️ **flat/fake** | Same — static value, not a real time series |
| `trend[].tertiary` | Members count for 3rd-largest segment | ⚠️ **flat/fake** | Same |

> The trend returns a real-looking time series but every point has the same value (the current snapshot). It will only become accurate once the segment snapshot job exists.

### Per-Segment Table

| Field | What it means | Status | Source |
|---|---|---|---|
| `segment_id` | Segment identifier | ✅ | MongoDB `segments` |
| `name` | Segment name | ✅ | MongoDB `segments` |
| `users` | Current member count | ✅ | MongoDB `segments.members_count` |
| `status` | `live` if `last_refresh_time` < 48 h ago, else `paused` | ✅ | MongoDB `segments.last_refresh_time` |
| `open_rate` | Opens ÷ sent across campaigns targeting this segment | ✅ | ClickHouse `_query_notification_events_by_campaign` + `campaign_runs`, rolled up per segment via `seg_to_campaigns` map |
| `conversion` | Attributed depositors across campaigns targeting this segment | ✅ | ClickHouse `_query_conversions_by_campaign` rolled up via `seg_to_campaigns`; `null` if no ClickHouse data |
| `growth_7d` | Change in `members_count` over the window | ❌ **always null** | Needs `segment_snapshots` collection. See below. |

---

## What's Missing — New Infrastructure Required

### 1. Segment Snapshots (fixes 4 data points)

Affects: `segment_growth` summary, `growth_7d` per segment, and both trend series in segment-analysis.

A background job needs to periodically write a snapshot of each segment's `members_count` to a new collection:

```
Collection: segment_snapshots
Fields:     project_id, segment_id, members_count, recorded_at
Index:      (project_id, segment_id, recorded_at)
Schedule:   daily (once per day is enough for 7d/30d windows)
```

Once this exists:
- `growth_7d` = latest snapshot `members_count` − snapshot from 7 days ago
- `segment_growth` summary = sum of those deltas across all segments
- Trend = one real data point per day from snapshots instead of repeating current value

### 2. Per-Channel Opt-Out Event (fixes 1 data point)

Affects: `opt_outs` per channel in the channel-delivery table.

A new `notification_unsubscribed` event needs to be defined in the event schema with a `channel` field, flow through ClickHouse, and be queryable by channel. The summary `opt_outs_7d` already works via `daily_boosts`, but the per-channel breakdown requires ClickHouse event data.
