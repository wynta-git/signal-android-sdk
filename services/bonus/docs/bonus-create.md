# First Deposit Bonus — Create Prompt

## Business Requirements

| Field | Value |
|---|---|
| Trigger event | `FIRST_DEPOSIT` |
| Bonus percentage | 200% of deposit amount |
| Maximum bonus cap | ₹500 |
| Overall validity | 1 year from activation date |
| Release mechanism | 5 equal chunks |
| Wager requirement per chunk | 2× chunk value (e.g. ₹10 chunk releases after ₹20 wagered) |
| Pending chunk expiry | 30 days (chunk forfeited if wager not completed within 30 days of grant) |
| Released bonus expiry | 90 days (if released balance unused, it is forfeited) |
| Bonus Head | `ACTIVATION` |
| Bonus Sub-Head | `ON-BOARDING` |
| Promo Code | `FIRST_DEPOSIT` |

---

## Setup Sequence

Run these four API calls in order. Each step depends on the `id` returned by the previous step.

---

### Step 1 — Create Bonus Head

```http
POST /bonus-heads
Content-Type: application/json

{
  "site_id": "<your-site-id>",
  "name": "ACTIVATION",
  "description": "Activation bonuses for new player on-boarding",
  "active": true,
  "owner": "<ops-lead-username>",
  "created_by": "<ops-lead-username>"
}
```

**Save the returned `id` as `HEAD_ID`.**

> Skip this step if an `ACTIVATION` head already exists for the site — fetch its `id` and use it as `HEAD_ID`.

---

### Step 2 — Create Bonus Sub-Head

```http
POST /bonus-subheads
Content-Type: application/json

{
  "head_id": "<HEAD_ID>",
  "site_id": "<your-site-id>",
  "name": "ON-BOARDING",
  "description": "On-boarding incentives tied to first deposit",
  "active": true,
  "owner": "<ops-lead-username>",
  "created_by": "<ops-lead-username>"
}
```

**Save the returned `id` as `SUBHEAD_ID`.**

> Skip this step if an `ON-BOARDING` subhead already exists under the `ACTIVATION` head — use its `id` as `SUBHEAD_ID`.

---

### Step 3 — Create Bonus Configure

`start_date` and `end_date` define the window during which new grants can be issued.  
Set `end_date` to exactly 1 year after `start_date`.

```http
POST /bonus-configures
Content-Type: application/json

{
  "subhead_id": "<SUBHEAD_ID>",
  "site_id": "<your-site-id>",
  "name": "First Deposit 200% — FIRST_DEPOSIT",
  "description": "200% first deposit bonus, max ₹500, released in 5 chunks on 2x wager",
  "active": true,
  "applicability_frequency": "ONCE",
  "no_of_chunks": 5,
  "wager_multiplier": "2.00",
  "bonus_amount_max": "500.00",
  "chunk_expiry_days": 30,
  "bonus_expiry_days": 90,
  "wager_chip_type": "CASH",
  "credit_chip_type": "CASH",
  "priority": 10,
  "start_date": "2026-05-15T00:00:00",
  "end_date": "2027-05-15T23:59:59",
  "created_by": "<ops-lead-username>"
}
```

**Save the returned `id` as `CONFIGURE_ID`.**

---

### Step 4 — Add Eligibility Criterion (registered this month)

Restricts this bonus to players whose account was registered in the current calendar month.

```http
POST /bonus-eligibilities
Content-Type: application/json

{
  "configure_id": "<CONFIGURE_ID>",
  "site_id": "<your-site-id>",
  "eligibility_key": "player_registered_period",
  "eligibility_value": "CURRENT_MONTH",
  "eligibility_value_type": "STRING",
  "description": "Only players who registered in the current calendar month",
  "active": true,
  "created_by": "<ops-lead-username>"
}
```

The consumer evaluates this rule against `properties.registered_at` in the incoming event payload. The grant is skipped if `registered_at` is absent or falls outside the current calendar month.

**Supported values for `player_registered_period`:**

| Value | Meaning |
|---|---|
| `CURRENT_MONTH` | Player's `registered_at` is in the same calendar month as the event |
| `CURRENT_WEEK` | Player's `registered_at` is in the same ISO calendar week as the event |
| `CURRENT_YEAR` | Player's `registered_at` is in the same calendar year as the event |

> The triggering event must include `registered_at` (ISO 8601 string) in its `properties`. If the field is missing the eligibility check fails and no grant is issued.

---

## Field Mapping — Business Rules to Model Fields

| Business Rule | Model Field | Value | Notes |
|---|---|---|---|
| 200% of deposit, max ₹500 | `bonus_amount_max` | `500.00` | Grant logic caps `deposit × 2.0` at this value |
| 5 chunks | `no_of_chunks` | `5` | Bonus split equally across 5 chunks |
| 2× wager per chunk | `wager_multiplier` | `2.00` | Each chunk releases after wagering 2× its value |
| Pending chunk expiry 30 days | `chunk_expiry_days` | `30` | Chunk state → `EXPIRED` if wager not met within 30 days |
| Released bonus expiry 90 days | `bonus_expiry_days` | `90` | Released balance → `FORFEITED` if unused within 90 days |
| Valid for 1 year | `start_date` / `end_date` | 1-year window | Controls eligibility window for new grants |
| First deposit only — no repeat | `applicability_frequency` | `ONCE` | Player can only receive this bonus once ever |
| Bonus Head: ACTIVATION | — | Step 1 above | Head name scoped per `site_id` |
| Sub-Head: ON-BOARDING | — | Step 2 above | Subhead name scoped per `head_id` |

---

## Promo Code — FIRST_DEPOSIT

The bonus configure auto-generates a default promo code on creation. You must add the `FIRST_DEPOSIT` code separately (or update the default code) via the configure codes endpoint once it is available.

Expected code payload:

```json
{
  "configure_id": "<CONFIGURE_ID>",
  "code": "FIRST_DEPOSIT",
  "valid_from": "2026-05-15T00:00:00",
  "valid_to": "2027-05-15T23:59:59",
  "auto_apply": true,
  "display_order": 1
}
```

`auto_apply: true` means this bonus is applied automatically when the `FIRST_DEPOSIT` event fires — no manual code entry required from the player.

---

## Trigger Event

The bonus consumer listens on topic `pam.bonus.raw.v1`. The grant is triggered when the consumer receives an event with:

```json
{
  "event_name": "FIRST_DEPOSIT",
  "user_id": "<player-id>",
  "properties": {
    "deposit_amount": "<amount>",
    "currency": "INR"
  }
}
```

Grant amount = `min(deposit_amount × 2.0, 500.00)`.

---

## Bonus Lifecycle for This Configuration

```
FIRST_DEPOSIT event received
        │
        ▼
Bonus granted → 5 chunks, each = grant_amount / 5
        │
        ├─ Chunk 1: PENDING ──── wager 2× chunk value ──→ RELEASED ──── 90 days ──→ FORFEITED
        │              │                                      │
        │           30 days                              (used in gameplay)
        │              ▼                                      ▼
        │           EXPIRED                              CONSUMED
        │
        ├─ Chunk 2 … 5: same lifecycle
```
