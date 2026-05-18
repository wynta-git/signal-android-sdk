# Campaign Engine — Trigger Workflows

## Workflow 1 — Event-Triggered

**Concept:** A user does something → campaign fires for that specific user (optionally with a delay).

```
api-service                    campaign-engine                     notifications-engine
    |                               |                                       |
    | publishes EventEnvelope       |                                       |
    |──── pam.events.raw.v1 ───────►|                                       |
    |                               |                                       |
    |                    [Kafka consumer, group: campaign-trigger]          |
    |                               |                                       |
    |                    1. Filter: does event_name match any               |
    |                       running campaign's trigger.event_name?          |
    |                       (e.g. "cart_abandoned")                         |
    |                               |                                       |
    |                    2. Audience check for that user:                   |
    |                       a. Redis cache: pam:seg:{seg_id}:{user_id}      |
    |                       b. Miss → query segment_memberships (MongoDB)   |
    |                               |                                       |
    |                    3. Rate limit check:                               |
    |                       Redis key: pam:campaign:sent:{camp_id}:{user_id}|
    |                       Skip if already sent within window              |
    |                               |                                       |
    |                    4. Delay (if campaign has delay.minutes):          |
    |                       Set deliver_at = now + delay                    |
    |                       (no separate queue — deliver_at goes in         |
    |                        the send job payload)                          |
    |                               |                                       |
    |                    5. Write campaign_run entry to MongoDB             |
    |                       (or update existing run for this campaign)      |
    |                               |                                       |
    |                    6. Emit send job                                   |
    |                       key=user_id                                     |
    |                       ──── pam.campaigns.send.v1 ───────────────────►|
    |                               |                                       |
    |                               |                    notifications-engine
    |                               |                    picks up and delivers
```

**Campaign state:** Stays `running` perpetually — every new matching event is a new potential trigger. Never moves to `completed` automatically (operator cancels/pauses it).

**Key data in send job:**
```json
{
  "context": {
    "event_id": "evt_that_triggered",
    "event_properties": { "cart_value": 49.99 }
  },
  "deliver_at": "2026-05-18T10:30:00Z"
}
```
The `event_properties` are passed through so the template can personalize with the triggering event's data.

---

## Workflow 2 — Scheduled (Cron)

**Concept:** A clock fires → campaign sends to every member of a segment at that moment.

```
campaign-engine (cron runner)          MongoDB              Kafka
        |                                  |                  |
  [cron fires: "0 9 * * MON"]             |                  |
        |                                  |                  |
  1. Load all campaigns where:             |                  |
     status=running AND                    |                  |
     trigger.type=scheduled                |                  |
     (from MongoDB campaigns collection)   |                  |
        |                                  |                  |
  2. Create campaign_run record ──────────►|                  |
     { campaign_id, started_at, status: "running" }          |
        |                                  |                  |
  3. Read segment membership ─────────────►|                  |
     query segment_memberships WHERE       |                  |
     segment_id = audience.segment_id      |                  |
     AND project_id = ...                  |                  |
        |                                  |                  |
  4. For each user_id in batch:            |                  |
     a. Rate limit check (Redis)           |                  |
     b. Skip opted-out users               |                  |
     c. Emit send job ────────────────────────────────────────►
        key=user_id, deliver_at=now        |                  |
        |                                  |                  |
  5. Update campaign_run ─────────────────►|                  |
     { status: "completed", sent_count, skipped_count }       |
```

**Campaign state:** Moves `running → completed` after each cron fire finishes. On the next cron tick, a new `campaign_run` is created and it runs again. The campaign itself stays `running` between ticks.

**Batching:** Segment can have millions of users — reads `segment_memberships` in cursor batches (e.g. 500 at a time) and emits send jobs per batch, not all into memory at once.

---

## Workflow 3 — One-Off

**Concept:** A single blast to an audience, either immediately or at a future timestamp. Runs exactly once.

```
Admin API call                 campaign-engine                  Kafka
    |                               |                             |
POST /campaigns (type=one_off)      |                             |
    |                               |                             |
    | status → "scheduled"          |                             |
    | send_at = "2026-04-30T10:00Z" |                             |
    |                               |                             |
    |              [at send_at, cron/scheduler wakes up]         |
    |                               |                             |
    |                    1. Load campaign from MongoDB            |
    |                       (status=scheduled, type=one_off,      |
    |                        send_at ≤ now)                       |
    |                               |                             |
    |                    2. Mark status → "running"               |
    |                       Create campaign_run record            |
    |                               |                             |
    |                    3. Read segment_memberships (batched)    |
    |                               |                             |
    |                    4. For each user:                        |
    |                       a. Rate limit check (Redis)           |
    |                       b. Emit send job ─────────────────────►
    |                          deliver_at = send_at               |
    |                               |                             |
    |                    5. Mark campaign status → "completed"    |
    |                       Update campaign_run with counts       |
    |                               |                             |
    |                    [Never runs again]                       |
```

**Campaign state:** `draft → scheduled → running → completed`. `completed` is terminal — one-off campaigns do not repeat.

---

## Side-by-side comparison

| | Event-triggered | Scheduled | One-off |
|---|---|---|---|
| **What fires it** | A user event on Kafka | Internal cron expression | A wall-clock timestamp |
| **Audience scope** | One user at a time | Entire segment per tick | Entire segment, once |
| **Delay support** | Yes (`deliver_at = now + delay`) | No (sends at cron time) | No (sends at `send_at`) |
| **Runs how many times** | Once per matching event, forever | Repeats on cron schedule | Exactly once |
| **Final state** | Stays `running` until operator stops it | Stays `running` between ticks | `completed` after send |
| **Personalization** | Rich — has triggering event's properties | None (no triggering event) | None |
| **MongoDB writes** | One `campaign_run` per campaign (or append to existing), rate-limit Redis write per user | One `campaign_run` per cron fire | One `campaign_run`, then status → `completed` |
