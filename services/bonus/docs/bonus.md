# Bonus System

## Overview

The bonus module manages the full lifecycle of player bonuses — from operator configuration through grant, wagering, release, consumption, expiry, and forfeit.

Bonuses are organised in a three-level configuration hierarchy before any player grant occurs:

```
bonus_head
  └─ bonus_subhead
       └─ bonus_configure  (mechanics inline: type, wager_multiplier, chunks, expiry, JSON configs)
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
  │  budget caps → bonus_budget_limit (entity_type='HEAD')
  │  runtime    → bonus_budget_usage  (entity_type='HEAD')
  │  owners     → bonus_owners        (entity_type='HEAD')
  │
  └─ bonus_subhead            Sub-category (e.g. "First Deposit", "Weekend Reload")
       │  budget caps → bonus_budget_limit (entity_type='SUBHEAD')
       │  runtime    → bonus_budget_usage  (entity_type='SUBHEAD')
       │  owners     → bonus_owners        (entity_type='SUBHEAD')
       │
       └─ bonus_configure     Leaf node — full mechanics inline (type, multiplier, chunks, expiry…)
            │  budget caps    → bonus_budget_limit    (entity_type='CONFIGURE')
            │  runtime        → bonus_budget_usage    (entity_type='CONFIGURE')
            │  eligibility    → bonus_eligibility
            │  trigger events → bonus_release_trigger
            │  bonus_amount_default / bonus_amount_max
            │
            └─ bonus_configure_code   Promo codes for this configuration
                 usage caps   → bonus_code_usage_limit (HOURLY/DAILY/WEEKLY/MONTHLY)
                 runtime      → bonus_code_usage
                 max_amount
```

### Budget check order at grant time

All levels are checked in sequence before writing `user_bonus_grant`:

```
bonus_configure_code → bonus_code_usage_limit / bonus_code_usage   (if a code was used)
  → bonus_configure  → bonus_budget_limit / bonus_budget_usage (entity_type='CONFIGURE')
    → bonus_subhead  → bonus_budget_limit / bonus_budget_usage (entity_type='SUBHEAD')
      → bonus_head   → bonus_budget_limit / bonus_budget_usage (entity_type='HEAD')
```

A grant is rejected if any level has `budget_used >= budget_limit` (where limit is not NULL).

### Budget counters

Budget caps and runtime counters are split into separate tables to keep the configuration rows cold (operator-written only):

- **`bonus_budget_limit`** — operator-set caps per (entity_type, entity_id, period_type); never written at grant time
- **`bonus_budget_usage`** — `budget_used` incremented at grant time; `reset_at` records the start of the current window and is used by the rollover scheduler

---

## Bonus Codes

A single `bonus_configure` node can have many promo codes (`bonus_configure_code`). Each code:
- Is unique per site
- Has its own per-code `max_amount` cap (overrides the configure node cap if set)
- Has independent **hourly / daily / weekly / monthly usage limits** (count of redemptions, not spend amount) stored in `bonus_code_usage_limit`
- Has an optional `valid_from` / `valid_to` window
- Carries full UI display metadata: `display_title`, `display_description`, `banner_image_url`, `badge_text`, `cta_text`, `auto_apply`, `display_order`, `display_on`, `min_display_amount`

At redemption time, running counters in `bonus_code_usage` are checked against `bonus_code_usage_limit` and incremented atomically in the same transaction as the grant.

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

Each row carries `grant_count` and `total_amount`. Written via `INSERT … ON DUPLICATE KEY UPDATE` inside the same transaction as the grant — no separate aggregation job required. On each grant, one row is upserted per ancestor in the chain: CODE (if used) → CONFIGURE → SUBHEAD → HEAD.

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
| `bonus_configure` | Leaf node — full mechanics config (type, release_mode, wager_multiplier, chunks, expiry, JSON configs) |
| `bonus_configure_code` | Promo codes per configure node; includes full UI display metadata |
| `bonus_budget_limit` | Operator-set budget caps per (entity_type, entity_id, period_type); never written at grant time |
| `bonus_code_usage_limit` | Operator-set redemption count caps per (code_id, period_type); never written at grant time |
| `bonus_eligibility` | Player eligibility rules per configure node; all active rows are ANDed at grant time |
| `bonus_owners` | Responsible persons per head/subhead with named roles (OPS_LEAD, CAMPAIGN_MANAGER, etc.) |
| `bonus_release_trigger` | Grant trigger events per configure node (DEPOSIT, REGISTRATION, MANUAL, PROMO_CODE, etc.) |

### Player grant layer

| Table | Purpose |
|---|---|
| `user_bonus_grant` | Immutable grant record; full mechanics snapshot at grant time; one row per grant |
| `bonus_chunk` | One row per chunk within a grant; tracks status (PENDING/RELEASE/EXPIRED/CONSUMED) and wager progress |
| `bonus_chunk_wager` | Each qualifying wager settlement contributing toward a chunk's release threshold |
| `bonus_chunk_release` | Audit record per wager event that triggered a chunk release to wallet |
| `bonus_chunk_expiry` | Each chunk expiry event (AUTO scheduler or MANUAL operator cancel) |
| `bonus_consumed` | Each debit of released bonus balance during gameplay |
| `bonus_forfeit` | Each full-bonus forfeit event (AUTO on disqualifying action or MANUAL by operator) |

### Budget & code usage runtime layer

| Table | Purpose |
|---|---|
| `bonus_budget_usage` | Running `budget_used` counter per (entity_type, entity_id, period_type); reset by rollover scheduler |
| `bonus_code_usage` | Running `usage_used` redemption counter per (code_id, period_type); reset by rollover scheduler |

### Spend analytics layer

| Table | Purpose |
|---|---|
| `bonus_spend_daily` | Aggregated daily spend per entity (HEAD/SUBHEAD/CONFIGURE/CODE) |
| `bonus_spend_weekly` | Aggregated weekly spend per entity (ISO week Mon–Sun) |
| `bonus_spend_monthly` | Aggregated monthly spend per entity |
