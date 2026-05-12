# Bonus System

## Overview

The bonus module manages the full lifecycle of player bonuses — from operator configuration through grant, wagering, release, consumption, expiry, and forfeit.

Bonuses are organised in a three-level configuration hierarchy before any player grant occurs:

```
bonus_head
  └─ bonus_subhead
       └─ bonus_configure  ──► userapp_bonus_configuration (mechanics template)
                └─ bonus_configure_code  (promo codes)
```

Each level carries its own **daily / weekly / monthly budget caps**. A grant is blocked if any ancestor in the chain has exhausted its budget.

---

## Bonus Lifecycle — State Machine

### How a bonus moves through states

When a bonus is granted it may arrive as one or more **chunks**. Each chunk has:
- a **wager requirement** — the player must bet `chunk_amount × wager_multiplier` before the chunk releases
- an optional **expiry date** — if the wager requirement is not met before this date, the chunk expires unused

Once a chunk's wager requirement is met it **releases** — the chunk amount is credited to the player's wallet. The released credit may also carry its own expiry, after which any remaining balance is voided.

Released credit is used during gameplay. When the balance is fully consumed the bonus reaches the **CONSUMED** state.

```
                         ┌─────────────────────────────────────────────────┐
                         │              Grant bonus to player               │
                         └─────────────────────────────────────────────────┘
                                              │
                               ┌──────────────┴─────────────┐
                               │                            │
                            INSTANT                       CHUNK
                               │                            │
                            ACTIVE                       PENDING ◄── operator cancels
                               │                            │         at any point → FORFEITED
                               │                    player wagers
                               │                            │
                               │              ┌─────────────┴──────────┐
                               │         first chunk              more chunks
                               │         released                 still pending
                               │              │                         │
                               │          PARTIALLY                (wager more)
                               │          RELEASED                      │
                               │              │                         │
                               │              └───── all chunks ──► RELEASED
                               │                     released             │
                               │                                 released credit
                               └──────────────────┬─────────── enters game use
                                                  │
                                         player uses bonus balance
                                                  │
                                               CONSUMED  ◄── balance fully consumed
                                                  │
                                          expiry date passes
                                          before condition met
                                                  │
                                               EXPIRED
```

### Status reference

| Status | Meaning |
|---|---|
| `PENDING` | Bonus granted; wagering not yet started |
| `ACTIVE` | Bonus is live and usable |
| `PARTIALLY_RELEASED` | At least one chunk released; others still pending |
| `RELEASED` | All chunks released to wallet |
| `CONSUMED` | Bonus balance fully consumed in gameplay |
| `EXPIRED` | Chunk or credit expiry date passed before conditions were met |
| `FORFEITED` | Operator or system cancelled the bonus |

### Chunk status

Each individual chunk within a bonus has its own status:

| Status | Meaning |
|---|---|
| `PENDING` | Created at grant; `wager_completed < wager_required` |
| `RELEASED` | `wager_completed >= wager_required`; credited to wallet |
| `EXPIRED` | Expiry date reached before wagering was complete |
| `FORFEITED` | Cancelled before release |

---

## Configuration Hierarchy

```
bonus_head                    Top-level category (e.g. "Welcome", "Reload", "Cashback")
  │  daily_budget_limit
  │  weekly_budget_limit
  │  monthly_budget_limit
  │
  └─ bonus_subhead            Sub-category (e.g. "First Deposit", "Weekend Reload")
       │  daily_budget_limit
       │  weekly_budget_limit
       │  monthly_budget_limit
       │
       └─ bonus_configure     Leaf node — binds a subhead to a bonus template
            │  bonus_amount_default / bonus_amount_max
            │  daily_budget_limit
            │  weekly_budget_limit
            │  monthly_budget_limit
            │
            └─ bonus_configure_code   Promo codes for this configuration
                 hourly_usage_limit
                 daily_usage_limit
                 weekly_usage_limit
                 monthly_usage_limit
                 max_amount
```

### Budget check order at grant time

All levels are checked in sequence before writing `userapp_player_bonus`:

```
bonus_configure_code  (if a code was used)
  → bonus_configure
    → bonus_subhead
      → bonus_head
```

A grant is rejected if any level has `*_budget_used >= *_budget_limit` (where limit is not NULL).

### Budget counters

Each level stores:
- `daily_budget_used` / `weekly_budget_used` / `monthly_budget_used` — incremented at grant time
- `daily_reset_at` / `weekly_reset_at` / `monthly_reset_at` — timestamp of last rollover; used by the reset scheduler

---

## Bonus Codes

A single `bonus_configure` node can have many promo codes (`bonus_configure_code`). Each code:
- Is unique per site
- Has its own per-code `max_amount` cap (overrides the configure node cap if set)
- Has independent **hourly / daily / weekly / monthly usage limits** (count of redemptions, not spend amount)
- Has an optional `valid_from` / `valid_to` window

Every redemption writes a row to `bonus_code_redemption_log` (idempotent on `(code_id, player_bonus_id)`), which drives the usage counter increments.

---

## Spend Aggregation

Three tables track cumulative spend across all hierarchy levels. The same `entity_type` / `entity_id` pattern covers every level:

| `entity_type` | `entity_id` references |
|---|---|
| `HEAD` | `bonus_head.id` |
| `SUBHEAD` | `bonus_subhead.id` |
| `CONFIGURE` | `bonus_configure.id` |
| `CODE` | `bonus_configure_code.id` |

| Table | Period | Unique key |
|---|---|---|
| `bonus_spend_daily` | Calendar day | `(entity_type, entity_id, spend_date)` |
| `bonus_spend_weekly` | ISO week Mon–Sun | `(entity_type, entity_id, week_start)` |
| `bonus_spend_monthly` | Calendar month | `(entity_type, entity_id, spend_year, spend_month)` |

Each row carries `grant_count` and `total_amount`. Written via `INSERT … ON DUPLICATE KEY UPDATE` inside the same transaction as the grant — no separate aggregation job required.

### Example queries

```sql
-- Head-wise spend this month
SELECT bh.name, s.grant_count, s.total_amount
FROM bonus_spend_monthly s
JOIN bonus_head bh ON bh.id = s.entity_id
WHERE s.entity_type = 'HEAD'
  AND s.spend_year = 2026 AND s.spend_month = 5;

-- Code-wise spend today
SELECT bcc.code, s.grant_count, s.total_amount
FROM bonus_spend_daily s
JOIN bonus_configure_code bcc ON bcc.id = s.entity_id
WHERE s.entity_type = 'CODE'
  AND s.spend_date = CURDATE();

-- Weekly burn rate for a specific configure node
SELECT week_start, week_end, grant_count, total_amount
FROM bonus_spend_weekly
WHERE entity_type = 'CONFIGURE' AND entity_id = 7
ORDER BY week_start DESC;
```

---

## Table Map

### Configuration layer

| Table | Purpose |
|---|---|
| `bonus_head` | Top-level budget category |
| `bonus_subhead` | Mid-level category under a head |
| `bonus_configure` | Leaf configuration node; links to a bonus template |
| `bonus_configure_code` | Promo codes per configure node with usage limits |
| `userapp_bonus_configuration` | Bonus campaign template (mechanics: type, multiplier, chunks, expiry) |
| `userapp_bonus_configuration_device` | Device eligibility per campaign |
| `userapp_device_info` | Lookup: device / OS / client type combinations |

### Player grant layer

| Table | Purpose |
|---|---|
| `userapp_player_bonus` | Master bonus record per grant |
| `userapp_bonus_chunk` | One row per chunk created at grant time |
| `userapp_bonus_chunk_wager` | Each qualifying bet counting toward a chunk's wager requirement |
| `userapp_bonus_rake` | Each rake contribution toward a chunk's wager requirement |
| `userapp_bonus_release` | Audit record when a chunk is released to wallet |
| `userapp_bonus_consumed` | Each in-game debit of the bonus balance |
| `userapp_bonus_forfeit` | Forfeit events — operator or system |
| `userapp_bonus_expired_chunk` | Expired unreleased chunk audit log |

### X-wagering layer (INSTANT with multiplier > 1)

| Table | Purpose |
|---|---|
| `wager_bucket_movement_log` | One entry per INSTANT credit with `x_wagering > 1` |
| `wager_bucket_movement_stack` | FIFO stack — individual wager events consuming the log entry |
| `wager_bucket_movement_transfer_log` | Full before/after wallet snapshot on every movement |

### Spend tracking layer

| Table | Purpose |
|---|---|
| `bonus_budget_grant_log` | One row per grant; records configure/subhead/head used and amount |
| `bonus_code_redemption_log` | One row per grant that used a promo code |
| `bonus_spend_daily` | Aggregated daily spend per entity (HEAD/SUBHEAD/CONFIGURE/CODE) |
| `bonus_spend_weekly` | Aggregated weekly spend per entity |
| `bonus_spend_monthly` | Aggregated monthly spend per entity |
