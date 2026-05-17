# April Birthday Bonus — Create Prompt

## Business Requirements

| Field | Value |
|---|---|
| Trigger event | `DEPOSIT` (during April, player birthday month = April) |
| Minimum deposit | ₹1,000 |
| Bonus amount | ₹500 (flat, on qualifying deposit) |
| Release mechanism | 5 equal chunks |
| Wager requirement per chunk | 1× chunk value (e.g. ₹100 chunk releases after ₹100 wagered) |
| Pending chunk expiry | 30 days (chunk forfeited if wager not completed within 30 days of grant) |
| Released bonus expiry | 90 days (if released balance unused, it is forfeited) |
| Bonus Head | `RETENTION` |
| Bonus Sub-Head | `REACTIVATION` |
| Promo Code | `APRIL_BIRTHDAY` |
| Recurrence | Once per year (same player can receive this bonus each April) |

---

## Setup Sequence

Run these five API calls in order. Each step depends on the `id` returned by the previous step.

---

### Step 1 — Create Bonus Head

```http
POST /bonus-heads
Content-Type: application/json

{
  "site_id": "<your-site-id>",
  "name": "RETENTION",
  "description": "Retention bonuses to re-engage and reward existing players",
  "active": true,
  "owner": "<ops-lead-username>",
  "created_by": "<ops-lead-username>"
}
```

**Save the returned `id` as `HEAD_ID`.**

> Skip this step if a `RETENTION` head already exists for the site — fetch its `id` and use it as `HEAD_ID`.

---

### Step 2 — Create Bonus Sub-Head

```http
POST /bonus-subheads
Content-Type: application/json

{
  "head_id": "<HEAD_ID>",
  "site_id": "<your-site-id>",
  "name": "REACTIVATION",
  "description": "Reactivation incentives for existing players — birthday and loyalty rewards",
  "active": true,
  "owner": "<ops-lead-username>",
  "created_by": "<ops-lead-username>"
}
```

**Save the returned `id` as `SUBHEAD_ID`.**

> Skip this step if a `REACTIVATION` subhead already exists under the `RETENTION` head — use its `id` as `SUBHEAD_ID`.

---

### Step 3 — Create Bonus Configure

`start_date` and `end_date` must cover the full month of April (or the April window you want to activate for).

```http
POST /bonus-configures
Content-Type: application/json

{
  "subhead_id": "<SUBHEAD_ID>",
  "site_id": "<your-site-id>",
  "name": "April Birthday Bonus — APRIL_BIRTHDAY",
  "description": "₹500 birthday bonus for April-born players on min ₹1000 deposit, released in 5 chunks on 1x wager",
  "active": true,
  "applicability_frequency": "YEARLY",
  "no_of_chunks": 5,
  "wager_multiplier": "1.00",
  "bonus_amount_max": "500.00",
  "chunk_expiry_days": 30,
  "bonus_expiry_days": 90,
  "wager_chip_type": "CASH",
  "credit_chip_type": "CASH",
  "priority": 20,
  "start_date": "2026-04-01T00:00:00",
  "end_date": "2026-04-30T23:59:59",
  "created_by": "<ops-lead-username>"
}
```

**Save the returned `id` as `CONFIGURE_ID`.**

> Update `start_date` / `end_date` each year to the April window for that year.

---

### Step 4 — Add Eligibility Criterion (birthday month = April)

Restricts this bonus to players whose birthday month is April.

```http
POST /bonus-eligibilities
Content-Type: application/json

{
  "configure_id": "<CONFIGURE_ID>",
  "site_id": "<your-site-id>",
  "eligibility_key": "player_birthday_month",
  "eligibility_value": "APRIL",
  "eligibility_value_type": "STRING",
  "description": "Only players whose birthday month is April",
  "active": true,
  "created_by": "<ops-lead-username>"
}
```

The consumer evaluates this rule against `properties.birthday_month` in the incoming event payload. The grant is skipped if `birthday_month` is absent or does not equal `APRIL`.

**Supported values for `player_birthday_month`:**

| Value | Meaning |
|---|---|
| `JANUARY` … `DECEMBER` | Player's birth month matches the given month |

> The triggering `DEPOSIT` event must include `birthday_month` (uppercase month name string) in its `properties`. If the field is missing the eligibility check fails and no grant is issued.

---

### Step 5 — Add Promo Code

```http
POST /bonus-configure-codes
Content-Type: application/json

{
  "configure_id": "<CONFIGURE_ID>",
  "code": "APRIL_BIRTHDAY",
  "valid_from": "2026-04-01T00:00:00",
  "valid_to": "2026-04-30T23:59:59",
  "auto_apply": true,
  "display_order": 1
}
```

`auto_apply: true` means the bonus is applied automatically when a qualifying `DEPOSIT` event fires in April — no manual code entry required from the player.

---

## Field Mapping — Business Rules to Model Fields

| Business Rule | Model Field | Value | Notes |
|---|---|---|---|
| ₹500 flat bonus | `bonus_amount_max` | `500.00` | Fixed grant; deposit × rate is capped at this value |
| 5 chunks | `no_of_chunks` | `5` | Bonus split equally → ₹100 per chunk |
| 1× wager per chunk | `wager_multiplier` | `1.00` | Each ₹100 chunk releases after wagering ₹100 |
| Pending chunk expiry 30 days | `chunk_expiry_days` | `30` | Chunk state → `EXPIRED` if wager not met within 30 days |
| Released bonus expiry 90 days | `bonus_expiry_days` | `90` | Released balance → `FORFEITED` if unused within 90 days |
| April window only | `start_date` / `end_date` | April 1–30 | New grants only issued while event falls in this window |
| Once per year | `applicability_frequency` | `YEARLY` | Same player can receive this bonus each April |
| Bonus Head: RETENTION | — | Step 1 above | Head name scoped per `site_id` |
| Sub-Head: REACTIVATION | — | Step 2 above | Subhead name scoped per `head_id` |
| Birthday month = April | `eligibility_key` | `player_birthday_month` | Evaluated against `properties.birthday_month` in event |

---

## Trigger Event

The bonus consumer listens on topic `pam.bonus.raw.v1`. The grant is triggered when the consumer receives a `DEPOSIT` event during April from a player whose birthday month is April:

```json
{
  "event_name": "DEPOSIT",
  "user_id": "<player-id>",
  "properties": {
    "deposit_amount": "1000.00",
    "currency": "INR",
    "birthday_month": "APRIL"
  }
}
```

Grant amount = `500.00` (flat) if `deposit_amount >= 1000.00`, else grant is skipped.

---

## Bonus Lifecycle for This Configuration

```
DEPOSIT event received (April, birthday_month = APRIL, deposit >= ₹1000)
        │
        ▼
Bonus granted → ₹500 split into 5 chunks of ₹100 each
        │
        ├─ Chunk 1: PENDING ──── wager 1× chunk value (₹100) ──→ RELEASED ──── 90 days ──→ FORFEITED
        │              │                                               │
        │           30 days                                      (used in gameplay)
        │              ▼                                               ▼
        │           EXPIRED                                        CONSUMED
        │
        ├─ Chunk 2 … 5: same lifecycle
```
