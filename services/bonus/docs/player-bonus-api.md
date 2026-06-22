# User Bonus API

Base path: `/api/v1/user-bonuses`

This API allows game clients and back-office integrations to query a user's applicable bonuses, record bonus consumption against wager events, revert erroneous consumptions, and inspect the full bonus transaction history.

---

## Authentication — Client ID Header

Endpoints that mutate state or return user-scoped data require an `X-Client-Id` header. The server resolves this to a `site_id` via a Redis lookup; requests with an unknown client are rejected with `401`.

| Header        | Type   | Required on                                                           |
| ------------- | ------ | --------------------------------------------------------------------- |
| `X-Client-Id` | string | `/consume`, `/{user_id}/summary`, `/{user_id}/transactions`, `/{user_id}/transactions/{txn_id}` |

The following endpoints do **not** require `X-Client-Id`:

- `GET /applicable-codes`
- `POST /validate-code`
- `POST /consume/{consume_txn_id}/revert`
- `GET /{user_id}/referral-code`

> **Client registration:** Contact the platform team to have your `client_id` provisioned.

### Error Responses for Auth Failures

| HTTP Status | Reason                        |
| ----------- | ----------------------------- |
| `401`       | `X-Client-Id` header missing  |
| `401`       | `X-Client-Id` not registered  |

---

## Endpoints

### 1. List Applicable Bonus Codes

Returns all active bonus codes available to a user on a given site. Codes are ordered by `display_order` ascending and can be used to render a bonus selection UI before a wager.

```
GET /api/v1/user-bonuses/applicable-codes
```

**Query Parameters**

| Parameter   | Type   | Required | Description                                             |
| ----------- | ------ | -------- | ------------------------------------------------------- |
| `user_id`   | string | Yes      | Platform user identifier (max 50 chars)                 |
| `chip_type` | string | Yes      | Filter codes by chip type — `cash` or `in_app_purchase` |

**Response `200 OK`**

```json
[
  {
    "promo_id": 12,
    "code": "WELCOME100",
    "max_amount": "500.00",
    "valid_from": "2025-01-01T00:00:00",
    "valid_to": "2025-12-31T23:59:59",
    "display_title": "Welcome Bonus",
    "display_description": "Get 100% on your first deposit up to ₹500",
    "terms_url": "https://example.com/terms/welcome",
    "banner_image_url": "https://cdn.example.com/banners/welcome.jpg",
    "badge_text": "Hot",
    "cta_text": "Claim Now",
    "auto_apply": false,
    "display_order": 1,
    "display_on": "DEPOSIT",
    "min_display_amount": "100.00",
    "wager_multiplier": "3.00",
    "no_of_chunks": 3,
    "applicability_frequency": "ONCE"
  }
]
```

**Response Fields**

| Field                     | Type             | Description                                           |
| ------------------------- | ---------------- | ----------------------------------------------------- |
| `promo_id`                | integer          | Bonus code record ID                                  |
| `code`                    | string           | Promo / bonus code string                             |
| `max_amount`              | decimal \| null  | Maximum bonus amount that can be granted              |
| `valid_from`              | datetime \| null | Code validity start (UTC)                             |
| `valid_to`                | datetime \| null | Code validity end (UTC)                               |
| `display_title`           | string \| null   | Short marketing title                                 |
| `display_description`     | string \| null   | Longer marketing copy                                 |
| `terms_url`               | string \| null   | URL to T&C page                                       |
| `banner_image_url`        | string \| null   | Promotional banner image URL                          |
| `badge_text`              | string \| null   | Label shown on badge (e.g. "Hot", "New")              |
| `cta_text`                | string \| null   | Call-to-action button label                           |
| `auto_apply`              | boolean          | If `true`, apply without user selection               |
| `display_order`           | integer          | Sort order for UI rendering                           |
| `display_on`              | string \| null   | Trigger context (e.g. `DEPOSIT`, `SIGNUP`)            |
| `min_display_amount`      | decimal \| null  | Minimum transaction amount to show this bonus         |
| `wager_multiplier`        | decimal          | Wagering requirement multiplier                       |
| `no_of_chunks`            | integer          | Number of release chunks for this bonus               |
| `applicability_frequency` | string \| null   | How often the code can be used (e.g. `ONCE`, `DAILY`) |

---

### 2. Validate a Bonus Code

Validates whether a promo code is applicable for a user without consuming it. Use this to give the user confirmation before they commit to a code (e.g. on a deposit screen).

```
POST /api/v1/user-bonuses/validate-code
```

**Request Body** `application/json`

```json
{
  "user_id": "USER_001",
  "chip_type": "cash",
  "code": "WELCOME100"
}
```

**Request Fields**

| Field       | Type   | Required | Description                                             |
| ----------- | ------ | -------- | ------------------------------------------------------- |
| `user_id`   | string | Yes      | Platform user identifier (max 50 chars)                 |
| `chip_type` | string | Yes      | Chip type — `cash` or `in_app_purchase`                 |
| `code`      | string | Yes      | Promo code to validate (max 50 chars)                   |

**Response `200 OK`**

```json
{
  "valid": true,
  "code": "WELCOME100",
  "reason": null,
  "promo_id": 12,
  "display_title": "Welcome Bonus",
  "wager_multiplier": "3.00",
  "no_of_chunks": 3
}
```

**Response Fields**

| Field              | Type             | Description                                                          |
| ------------------ | ---------------- | -------------------------------------------------------------------- |
| `valid`            | boolean          | `true` if the code is applicable for this user and chip type         |
| `code`             | string           | Echo of the submitted promo code                                     |
| `reason`           | string \| null   | Human-readable reason when `valid` is `false`; `null` when valid     |
| `promo_id`         | integer \| null  | Bonus configure promo ID; `null` when invalid                        |
| `display_title`    | string \| null   | Marketing title for the bonus; `null` when invalid                   |
| `wager_multiplier` | decimal \| null  | Wagering requirement multiplier; `null` when invalid                 |
| `no_of_chunks`     | integer \| null  | Number of release chunks; `null` when invalid                        |

---

### 3. Consume a Bonus Chunk

Records that a specific bonus chunk has been consumed against a wager event. Call this from the game server immediately after a successful wager that should draw from a user's bonus.

```
POST /api/v1/user-bonuses/consume
```

**Request Body** `application/json`

```json
{
  "user_id": "USER_001",
  "consume_txn_id": "TXN20250519001",
  "wager_amount": "300.00",
  "bonus_amount": "100.00",
  "chip_type": "cash",
  "wager_tnx_id": "WAGER_REF_001",
  "game_id": "GAME_ROULETTE_01",
  "round_id": "ROUND_999"
}
```

**Request Fields**

| Field            | Type           | Required | Description                                                   |
| ---------------- | -------------- | -------- | ------------------------------------------------------------- |
| `user_id`        | string         | Yes      | Platform user identifier (max 50 chars)                       |
| `consume_txn_id` | string         | Yes      | Idempotency key — unique per consumption event (max 50 chars) |
| `wager_amount`   | decimal        | Yes      | Total wager amount placed (≥ 0)                               |
| `bonus_amount`   | decimal        | Yes      | Bonus amount being consumed (≥ 0)                             |
| `chip_type`      | string         | Yes      | Chip type — `cash` or `in_app_purchase`                       |
| `wager_tnx_id`   | string         | Yes      | Reference ID of the wager transaction (max 50 chars)          |
| `game_id`        | string \| null | No       | Game identifier (max 50 chars)                                |
| `round_id`       | string \| null | No       | Game round identifier (max 50 chars)                          |

> **Idempotency:** If a request is retried with the same `consume_txn_id`, the server returns `409 Conflict`. Store `consume_txn_id` values on your side to safely detect duplicates. The service auto-selects the user's next available released bonus chunk.

**Response `201 Created`**

```json
{
  "txn_id": 88,
  "consume_txn_id": "TXN20250519001",
  "bonus_amount": "100.00",
  "consumed_amount": "100.00",
  "chip_type": "cash"
}
```

**Response Fields**

| Field             | Type    | Description                                  |
| ----------------- | ------- | -------------------------------------------- |
| `txn_id`          | integer | Unique consumption record ID                 |
| `consume_txn_id`  | string  | Echo of the supplied idempotency key         |
| `bonus_amount`    | decimal | Bonus amount applied                         |
| `consumed_amount` | decimal | Consumed amount credited                     |
| `chip_type`       | string  | Chip type used — `cash` or `in_app_purchase` |

---

### 4. Revert a Bonus Consumption

Cancels a previously recorded consumption — for example, when a wager is voided or rolled back. Reverting decrements the user's consumed balance by the original consumption amount.

```
POST /api/v1/user-bonuses/consume/{consume_txn_id}/revert
```

**Path Parameters**

| Parameter        | Type   | Description                                               |
| ---------------- | ------ | --------------------------------------------------------- |
| `consume_txn_id` | string | The `consume_txn_id` supplied when the bonus was consumed |

**Response `200 OK`**

```json
{
  "txn_id": 88,
  "consume_txn_id": "TXN20250519001",
  "amount": "100.00",
  "chip_type": "cash"
}
```

**Response Fields**

| Field            | Type    | Description                             |
| ---------------- | ------- | --------------------------------------- |
| `txn_id`         | integer | Consumption record ID                   |
| `consume_txn_id` | string  | Original idempotency key                |
| `amount`         | decimal | Amount that was reversed                |
| `chip_type`      | string  | Chip type — `cash` or `in_app_purchase` |

---

### 5. Get User Bonus Summary

Returns bonus figures for a user broken down by chip type. Each element in the array represents one chip type the user has active or historical grants for.

```
GET /api/v1/user-bonuses/{user_id}/summary
```

**Path Parameters**

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `user_id` | string | Platform user identifier |

**Response `200 OK`**

```json
[
  {
    "chip_type": "cash",
    "bonus_balance": "600.00",
    "pending_bonus": "400.00",
    "wagering_required": "1200.00"
  },
  {
    "chip_type": "in_app_purchase",
    "bonus_balance": "200.00",
    "pending_bonus": "100.00",
    "wagering_required": "300.00"
  }
]
```

**Response Fields** _(per array item)_

| Field               | Type    | Description                                                       |
| ------------------- | ------- | ----------------------------------------------------------------- |
| `chip_type`         | string  | Chip type — `cash` or `in_app_purchase`                           |
| `bonus_balance`     | decimal | Available bonus balance (total released minus total consumed)     |
| `pending_bonus`     | decimal | Total bonus amount in chunks not yet released                     |
| `wagering_required` | decimal | Remaining wager amount needed to release all pending bonus chunks |

---

### 6. List User Transactions

Returns a paginated list of bonus grant transactions for a user, ordered by most recent first. Each item shows a summary with a derived lifecycle status.

```
GET /api/v1/user-bonuses/{user_id}/transactions
```

**Path Parameters**

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `user_id` | string | Platform user identifier |

**Query Parameters**

| Parameter   | Type    | Required | Default | Description                                       |
| ----------- | ------- | -------- | ------- | ------------------------------------------------- |
| `chip_type` | string  | Yes      | —       | Filter by chip type — `cash` or `in_app_purchase` |
| `limit`     | integer | No       | `50`    | Results per page (1–200)                          |
| `offset`    | integer | No       | `0`     | Pagination offset (≥ 0)                           |

**Response `200 OK`**

A flat ledger ordered by most recent first. Every bonus event — grant, chunk release, consumption, expiry, or forfeit — is its own entry.

```json
[
  {
    "txn_id": 15,
    "bonus_code": "WELCOME100",
    "amount": "500.00",
    "type": "grant",
    "created_at": "2025-05-19T08:00:00"
  },
  {
    "txn_id": 20,
    "bonus_code": null,
    "amount": "166.67",
    "type": "released",
    "created_at": "2025-05-19T09:00:00"
  },
  {
    "txn_id": 21,
    "bonus_code": null,
    "amount": "166.67",
    "type": "consumed",
    "created_at": "2025-05-19T10:15:00"
  },
  {
    "txn_id": 22,
    "bonus_code": null,
    "amount": "166.67",
    "type": "expiry",
    "created_at": "2025-05-20T08:00:00"
  },
  {
    "txn_id": 23,
    "bonus_code": null,
    "amount": "166.67",
    "type": "forfeited",
    "created_at": "2025-05-21T11:00:00"
  }
]
```

**Response Fields**

| Field        | Type           | Description                                    |
| ------------ | -------------- | ---------------------------------------------- |
| `txn_id`     | integer        | ID of the underlying event record              |
| `bonus_code` | string \| null | Promo code — populated for `grant` events only |
| `amount`     | decimal        | Amount involved in this event                  |
| `type`       | string         | Event type (see below)                         |
| `created_at` | datetime       | Event timestamp (UTC)                          |

**Type Values**

| Type        | Meaning                                         |
| ----------- | ----------------------------------------------- |
| `grant`     | Bonus was granted to the user                   |
| `released`  | A bonus chunk moved from pending to released    |
| `consumed`  | A released chunk was consumed against a wager   |
| `expiry`    | A chunk or bonus expired before being consumed  |
| `forfeited` | The bonus was forfeited before full consumption |

---

### 7. Get Transaction Detail

Returns the full detail of a single bonus grant including all chunks, forfeit record (if any), and expiry events.

```
GET /api/v1/user-bonuses/{user_id}/transactions/{txn_id}
```

**Path Parameters**

| Parameter | Type    | Description                                              |
| --------- | ------- | -------------------------------------------------------- |
| `user_id` | string  | Platform user identifier                                 |
| `txn_id`  | integer | Grant record ID (the `txn_id` from the transaction list) |

**Response `200 OK`**

```json
{
  "txn_id": 15,
  "user_id": "USER_001",
  "bonus_code": "WELCOME100",
  "wager_multiplier": "3.00",
  "no_of_chunks": 3,
  "chunk_expiry_days": 7,
  "bonus_expiry_days": 30,
  "wager_chip_type": "BONUS",
  "credit_chip_type": "CASH",
  "grant_amount": "500.00",
  "release_amount": "300.00",
  "bonus_consumed": "200.00",
  "status": "PARTIALLY_RELEASED",
  "created_at": "2025-05-01T08:00:00",
  "chunks": [
    {
      "id": 101,
      "chunk_ref": "CHUNK_001",
      "chunk_amount": "166.67",
      "wager_multiplier": "3.00",
      "status": "CONSUMED",
      "wager_amount": "500.00",
      "created_at": "2025-05-01T08:00:00",
      "updated_at": "2025-05-03T14:22:00"
    }
  ],
  "forfeit": null,
  "expiry_events": []
}
```

**Response Fields**

| Field               | Type            | Description                                |
| ------------------- | --------------- | ------------------------------------------ |
| `txn_id`            | integer         | Grant record ID                            |
| `user_id`           | string          | user identifier                            |
| `bonus_code`        | string \| null  | Promo code used                            |
| `wager_multiplier`  | decimal         | Wagering requirement multiplier            |
| `no_of_chunks`      | integer         | Total number of chunks                     |
| `chunk_expiry_days` | integer \| null | Days before an unreleased chunk expires    |
| `bonus_expiry_days` | integer \| null | Days before the entire bonus expires       |
| `wager_chip_type`   | string          | Chip type used for wagering                |
| `credit_chip_type`  | string          | Chip type used when crediting winnings     |
| `grant_amount`      | decimal         | Total amount granted                       |
| `release_amount`    | decimal         | Total amount released                      |
| `bonus_consumed`    | decimal         | Total amount consumed                      |
| `status`            | string          | Derived lifecycle status                   |
| `created_at`        | datetime        | Grant creation timestamp (UTC)             |
| `chunks`            | array           | Individual chunk details (see below)       |
| `forfeit`           | object \| null  | Forfeit record, if the bonus was forfeited |
| `expiry_events`     | array           | List of expiry events                      |

**Chunk Object**

| Field              | Type     | Description                                    |
| ------------------ | -------- | ---------------------------------------------- |
| `id`               | integer  | Chunk record ID                                |
| `chunk_ref`        | string   | Human-readable chunk reference                 |
| `chunk_amount`     | decimal  | Bonus amount in this chunk                     |
| `wager_multiplier` | decimal  | Wagering multiplier for this chunk             |
| `status`           | string   | `PENDING`, `RELEASE`, `CONSUMED`, or `EXPIRED` |
| `wager_amount`     | decimal  | Wagering progress toward release               |
| `created_at`       | datetime | Chunk creation timestamp                       |
| `updated_at`       | datetime | Last status change timestamp                   |

**Forfeit Object**

| Field          | Type           | Description                                    |
| -------------- | -------------- | ---------------------------------------------- |
| `id`           | integer        | Forfeit record ID                              |
| `amount`       | decimal        | Forfeited amount                               |
| `type`         | string         | Forfeit type (e.g. `MANUAL`, `RULE_VIOLATION`) |
| `operator`     | string \| null | Operator who triggered the forfeit             |
| `forfeited_at` | datetime       | Forfeit timestamp                              |

**Expiry Event Object**

| Field        | Type           | Description                                       |
| ------------ | -------------- | ------------------------------------------------- |
| `id`         | integer        | Expiry record ID                                  |
| `chunk_id`   | integer        | Chunk that expired                                |
| `amount`     | decimal        | Expired amount                                    |
| `type`       | string         | Expiry type (e.g. `CHUNK_EXPIRY`, `BONUS_EXPIRY`) |
| `operator`   | string \| null | Operator who triggered the expiry, if manual      |
| `expired_at` | datetime       | Expiry timestamp                                  |

---

### 8. Get User Referral Code

Returns the referral code assigned to a user. This code can be shared with friends to track referral-driven bonus eligibility.

```
GET /api/v1/user-bonuses/{user_id}/referral-code
```

**Path Parameters**

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `user_id` | string | Platform user identifier |

**Response `200 OK`**

```json
{
  "user_id": "USER_001",
  "referral_code": "REF_XYZ99",
  "created_at": "2025-05-01T08:00:00"
}
```

**Response Fields**

| Field           | Type     | Description                                |
| --------------- | -------- | ------------------------------------------ |
| `user_id`       | string   | User identifier                            |
| `referral_code` | string   | Unique referral code assigned to this user |
| `created_at`    | datetime | When the referral code was generated (UTC) |

**Error Cases**

| HTTP Status | Scenario                             |
| ----------- | ------------------------------------ |
| `404`       | No referral code found for `user_id` |

---

## Error Responses

All errors follow a consistent envelope:

```json
{
  "detail": "Human-readable error message"
}
```

| HTTP Status                 | Scenario                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `400 Bad Request`           | Request validation failed (missing fields, out-of-range values)                                                                  |
| `404 Not Found`             | The referenced bonus grant, chunk, or consumption record does not exist, or does not belong to the given user                    |
| `409 Conflict`              | Duplicate consumption (`consume_txn_id` already recorded), no released chunk available for user, or consumption already reverted |
| `500 Internal Server Error` | Unexpected database error                                                                                                        |

---

## Integration Flow

```
1. User initiates a deposit / game round
       │
       ▼
2. GET /api/v1/user-bonuses/applicable-codes?user_id=&chip_type=
   → Display eligible bonus offers to the user
       │
       ▼
3. User enters a code
   → POST /api/v1/user-bonuses/validate-code  { user_id, chip_type, code }
   → Check valid=true before proceeding; show reason to user if false
       │
       ▼
4. Release triggers fire (event-driven, internal)
   → Chunks move from PENDING → RELEASE as user meets trigger conditions
       │
       ▼
5. User wagers using released bonus
   → POST /api/v1/user-bonuses/consume  { user_id, consume_txn_id, bonus_amount, wager_amount, wager_tnx_id, ... }
       │
       ▼
6. If wager is voided:
   → POST /api/v1/user-bonuses/consume/{consume_txn_id}/revert
       │
       ▼
7. Display wallet / history:
     GET /api/v1/user-bonuses/{user_id}/summary
     GET /api/v1/user-bonuses/{user_id}/transactions?chip_type=cash
     GET /api/v1/user-bonuses/{user_id}/transactions/{txn_id}
```

---

# Bonus Events

Events consumed by the bonus service to evaluate eligibility, trigger grants, and update wager progress. All events share the standard PAM envelope (see [`docs/event-schema.md`](../../../docs/event-schema.md)).

All event names use `SCREAMING_SNAKE_CASE`.

## Envelope (common to all events)

```json
{
  "event_id": "uuid-v4",
  "event_name": "SCREAMING_SNAKE_CASE_EVENT_NAME",
  "user_id": "user_001",
  "session_id": "sess_optional",
  "timestamp": "2026-05-14T10:00:00.000Z",
  "device": "android",
  "platform": "web",
  "properties": {}
}
```

---

## user Action Events

### `LOGIN`

user successfully logs in.

| Property       | Type   | Required | Notes                                     |
| -------------- | ------ | -------- | ----------------------------------------- |
| `login_method` | string | yes      | `email`, `phone`, `google`, `apple`, etc. |
| `ip`           | string | no       | PII — hashed before storage.              |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000001",
  "event_name": "LOGIN",
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T08:00:00.000Z",
  "properties": {
    "login_method": "phone"
  }
}
```

---

### `REGISTRATION`

New user account created.

| Property              | Type   | Required | Notes                                   |
| --------------------- | ------ | -------- | --------------------------------------- |
| `registration_method` | string | yes      | `email`, `phone`, `google`, `apple`.    |
| `referral_code`       | string | no       | Promo or referral code used at sign-up. |
| `ip`                  | string | no       | PII — hashed before storage.            |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000002",
  "event_name": "REGISTRATION",
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T08:01:00.000Z",
  "properties": {
    "registration_method": "phone",
    "referral_code": "PROMO50"
  }
}
```

---

### `APP_VISIT`

user opens or resumes the app.

| Property      | Type | Required | Notes                                                    |
| ------------- | ---- | -------- | -------------------------------------------------------- |
| `visit_count` | int  | no       | Cumulative visit count for this user including this one. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000003",
  "event_name": "APP_VISIT",
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T08:10:00.000Z",
  "properties": {
    "visit_count": 5
  }
}
```

---

## Deposit Events

### `DEPOSIT`

user completes a deposit. Set `is_ftd: true` when this is the user's first ever deposit — the trigger system uses this flag to evaluate first-deposit bonus rules.

| Property         | Type              | Required | Notes                                                      |
| ---------------- | ----------------- | -------- | ---------------------------------------------------------- |
| `order_id`       | string            | yes      | Idempotent per project.                                    |
| `amount`         | decimal           | yes      | Exact settled value; 4-decimal precision.                  |
| `currency`       | string (ISO 4217) | yes      | e.g. `INR`.                                                |
| `payment_method` | string            | yes      | `upi`, `netbanking`, `card`, `wallet`.                     |
| `is_ftd`         | bool              | yes      | `true` if this is the user's first deposit.                |
| `deposit_count`  | int               | no       | Cumulative deposit count for this user including this one. |

```json
{
  "event_id": "76b689f2-e56a-480d-8c4a-21614a896b57",
  "event_name": "DEPOSIT",
  "user_id": "user_001",
  "session_id": "sess_6b31a39f",
  "timestamp": "2026-05-14T11:58:41.459Z",
  "properties": {
    "order_id": "dep_48758cbbceaf",
    "amount": "3570.0500",
    "currency": "INR",
    "payment_method": "upi",
    "is_ftd": false,
    "deposit_count": 3
  }
}
```

---

## Gameplay & Betting Events

### `BET_PLACED`

Emitted when a wager is accepted by the RGS. This event resets the user's session timeout.

| Property        | Type    | Required | Notes                                                  |
| --------------- | ------- | -------- | ------------------------------------------------------ |
| `wager_amount`  | decimal | yes      | Stake size; 4-decimal precision.                       |
| `game_id`       | string  | yes      | Target game ID (e.g. `book_of_frosty`).                |
| `game_category` | string  | no       | Vertical: `slots`, `roulette`, `blackjack`, `crash`.   |
| `game_provider` | string  | no       | Studio name (e.g. `evolution`, `netent`, `pragmatic`). |
| `balance_type`  | string  | yes      | Wallet source: `real`, `bonus`, or `freebet`.          |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000050",
  "event_name": "BET_PLACED",
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T19:00:00.000Z",
  "properties": {
    "wager_amount": "250.0000",
    "game_id": "book_of_frosty",
    "game_category": "slots",
    "game_provider": "pragmatic",
    "balance_type": "bonus"
  }
}
```

---

## Game Events

### `LEADERBOARD_WON`

user wins or places in a leaderboard competition.

| Property         | Type              | Required | Notes                                     |
| ---------------- | ----------------- | -------- | ----------------------------------------- |
| `leaderboard_id` | string            | yes      | ID of the leaderboard.                    |
| `rank`           | int               | yes      | user's final rank.                        |
| `prize_amount`   | decimal           | yes      | In `currency` units; 4-decimal precision. |
| `currency`       | string (ISO 4217) | yes      | e.g. `INR`.                               |
| `period`         | string            | yes      | `DAILY`, `WEEKLY`, `MONTHLY`.             |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000031",
  "event_name": "LEADERBOARD_WON",
  "user_id": "user_001",
  "timestamp": "2026-05-14T23:59:00.000Z",
  "properties": {
    "leaderboard_id": "lb_weekly_001",
    "rank": 2,
    "prize_amount": "5000.0000",
    "currency": "INR",
    "period": "WEEKLY"
  }
}
```

---

### `TOURNAMENT_WON`

user wins or places in a tournament.

| Property        | Type              | Required | Notes                                     |
| --------------- | ----------------- | -------- | ----------------------------------------- |
| `tournament_id` | string            | yes      | ID of the tournament.                     |
| `rank`          | int               | yes      | user's final rank.                        |
| `prize_amount`  | decimal           | yes      | In `currency` units; 4-decimal precision. |
| `currency`      | string (ISO 4217) | yes      | e.g. `INR`.                               |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000032",
  "event_name": "TOURNAMENT_WON",
  "user_id": "user_001",
  "timestamp": "2026-05-14T23:59:00.000Z",
  "properties": {
    "tournament_id": "trn_may_championship",
    "rank": 1,
    "prize_amount": "10000.0000",
    "currency": "INR"
  }
}
```

---

## Referral Events

### `FRIEND_SIGNUP`

A friend referred by this user completes registration.

| Property         | Type   | Required | Notes                                |
| ---------------- | ------ | -------- | ------------------------------------ |
| `friend_user_id` | string | yes      | User ID of the friend who signed up. |
| `referral_code`  | string | yes      | Code used by the friend at sign-up.  |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000010",
  "event_name": "FRIEND_SIGNUP",
  "user_id": "user_001",
  "timestamp": "2026-05-14T12:00:00.000Z",
  "properties": {
    "friend_user_id": "user_002",
    "referral_code": "REF_XYZ99"
  }
}
```

---

## Event → Trigger Mapping

| Event             | `bonus_release_trigger.trigger_type` |
| ----------------- | ------------------------------------ |
| `LOGIN`           | `LOGIN`                              |
| `REGISTRATION`    | `REGISTRATION`                       |
| `APP_VISIT`       | `APP_VISIT`                          |
| `DEPOSIT`         | `DEPOSIT`                            |
| `BET_PLACED`      | `BET_PLACED`                         |
| `LEADERBOARD_WON` | `LEADERBOARD_WON`                    |
| `TOURNAMENT_WON`  | `TOURNAMENT_WON`                     |
| `FRIEND_SIGNUP`   | `FRIEND_SIGNUP`                      |

---

## PII fields

The following properties are PII and **must be hashed (SHA-256 with project salt) before persistence**:

- `email`, `phone`, `ip`

Raw values may transit `api-service` over TLS but must never be logged or written to ClickHouse / MongoDB unhashed.

## Notes

- All monetary values are **decimal strings** to avoid floating-point precision loss. Parse with a `Decimal` or equivalent type in your language.
- All timestamps are **UTC** in ISO 8601 format (`YYYY-MM-DDTHH:MM:SS`).
- The `consume_txn_id` field is your idempotency key. Generate it on your side (e.g. a transaction UUID) and store it before calling the API so you can detect duplicate calls on retry. Pass the same value to the revert endpoint to cancel a consumption.
- A chunk must be in `RELEASE` status before it can be consumed. The chunk status transitions: `PENDING → RELEASE → CONSUMED / EXPIRED`.
