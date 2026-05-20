# Player Bonus API

Base path: `/api/v1/player-bonuses`

This API allows game clients and back-office integrations to query a player's applicable bonuses, record bonus consumption against wager events, revert erroneous consumptions, and inspect the full bonus transaction history.

---

## Authentication — S2S HMAC Signature

All requests are server-to-server (S2S) and must include three headers on every call:

| Header        | Type   | Description                                                |
| ------------- | ------ | ---------------------------------------------------------- |
| `X-Client-Id` | string | Your registered client identifier                          |
| `X-Timestamp` | string | Current Unix epoch **seconds** (e.g. `1716112200`)         |
| `X-Signature` | string | HMAC-SHA256 hex digest of the canonical string (see below) |

Requests with a timestamp more than **300 seconds** from the server's clock are rejected to prevent replay attacks.

---

### Building the Canonical String

```
canonical = "{client_id}\n{timestamp}\n{raw_body}"
```

- `client_id` — your `X-Client-Id` value
- `timestamp` — the exact string you send in `X-Timestamp`
- `raw_body` — the raw UTF-8 request body bytes; **empty string** for GET requests (no body)

Then sign it:

```
signature = HMAC-SHA256(client_secret, canonical)
X-Signature = hex(signature)
```

---

### Code Examples

**Python**

```python
import hashlib, hmac, time, json, requests

client_id = "game_server"
client_secret = "your_shared_secret"
timestamp = str(int(time.time()))

body = json.dumps({
    "user_id": "PLAYER_001",
    "consume_txn_id": "TXN20250519001",
    "wager_amount": "300.00",
    "bonus_amount": "100.00",
    "wager_tnx_id": "WAGER_REF_001"
}, separators=(',', ':'))

canonical = f"{client_id}\n{timestamp}\n{body}".encode()
signature = hmac.new(client_secret.encode(), canonical, hashlib.sha256).hexdigest()

resp = requests.post(
    "http://localhost:8010/api/v1/player-bonuses/consume",
    data=body,
    headers={
        "Content-Type": "application/json",
        "X-Client-Id": client_id,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
    }
)
```

**Node.js**

```javascript
const crypto = require("crypto");

const clientId = "game_server";
const clientSecret = "your_shared_secret";
const timestamp = String(Math.floor(Date.now() / 1000));

const body = JSON.stringify({
  user_id: "PLAYER_001",
  consume_txn_id: "TXN20250519001",
  wager_amount: "300.00",
  bonus_amount: "100.00",
  wager_tnx_id: "WAGER_REF_001",
});

const canonical = `${clientId}\n${timestamp}\n${body}`;
const signature = crypto
  .createHmac("sha256", clientSecret)
  .update(canonical)
  .digest("hex");

fetch("http://localhost:8010/api/v1/player-bonuses/consume", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Client-Id": clientId,
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  },
  body,
});
```

**GET request (no body)**

```python
timestamp = str(int(time.time()))
canonical = f"{client_id}\n{timestamp}\n".encode()   # empty body
signature = hmac.new(client_secret.encode(), canonical, hashlib.sha256).hexdigest()

requests.get(
    "http://localhost:8010/api/v1/player-bonuses/applicable-codes",
    params={"user_id": "PLAYER_001", "chip_type": "cash"},
    headers={"X-Client-Id": client_id, "X-Timestamp": timestamp, "X-Signature": signature},
)
```

---

### Error Responses for Auth Failures

| HTTP Status | Reason                                           |
| ----------- | ------------------------------------------------ |
| `401`       | Missing or malformed headers                     |
| `401`       | `X-Timestamp` outside the ±300-second window     |
| `401`       | `X-Client-Id` not registered                     |
| `401`       | `X-Signature` does not match the computed digest |

---

## Endpoints

### 1. List Applicable Bonus Codes

Returns all active bonus codes available to a player on a given site. Codes are ordered by `display_order` ascending and can be used to render a bonus selection UI before a wager.

```
GET /api/v1/player-bonuses/applicable-codes
```

**Query Parameters**

| Parameter   | Type   | Required | Description                                             |
| ----------- | ------ | -------- | ------------------------------------------------------- |
| `user_id` | string | Yes      | Platform player identifier (max 50 chars)               |
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
| `auto_apply`              | boolean          | If `true`, apply without player selection             |
| `display_order`           | integer          | Sort order for UI rendering                           |
| `display_on`              | string \| null   | Trigger context (e.g. `DEPOSIT`, `SIGNUP`)            |
| `min_display_amount`      | decimal \| null  | Minimum transaction amount to show this bonus         |
| `wager_multiplier`        | decimal          | Wagering requirement multiplier                       |
| `no_of_chunks`            | integer          | Number of release chunks for this bonus               |
| `applicability_frequency` | string \| null   | How often the code can be used (e.g. `ONCE`, `DAILY`) |

---

### 2. Consume a Bonus Chunk

Records that a specific bonus chunk has been consumed against a wager event. Call this from the game server immediately after a successful wager that should draw from a player's bonus.

```
POST /api/v1/player-bonuses/consume
```

**Request Body** `application/json`

```json
{
  "user_id": "PLAYER_001",
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
| `user_id`      | string         | Yes      | Platform player identifier (max 50 chars)                     |
| `consume_txn_id` | string         | Yes      | Idempotency key — unique per consumption event (max 50 chars) |
| `wager_amount`   | decimal        | Yes      | Total wager amount placed (≥ 0)                               |
| `bonus_amount`   | decimal        | Yes      | Bonus amount being consumed (≥ 0)                             |
| `chip_type`      | string         | Yes      | Chip type — `cash` or `in_app_purchase`                       |
| `wager_tnx_id`   | string         | Yes      | Reference ID of the wager transaction (max 50 chars)          |
| `game_id`        | string \| null | No       | Game identifier (max 50 chars)                                |
| `round_id`       | string \| null | No       | Game round identifier (max 50 chars)                          |

> **Idempotency:** If a request is retried with the same `consume_txn_id`, the server returns `409 Conflict`. Store `consume_txn_id` values on your side to safely detect duplicates. The service auto-selects the player's next available released bonus chunk.

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

### 3. Revert a Bonus Consumption

Cancels a previously recorded consumption — for example, when a wager is voided or rolled back. Reverting decrements the player's consumed balance by the original consumption amount.

```
POST /api/v1/player-bonuses/consume/{consume_txn_id}/revert
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

### 4. Get Player Bonus Summary

Returns bonus figures for a player broken down by chip type. Each element in the array represents one chip type the player has active or historical grants for.

```
GET /api/v1/player-bonuses/{user_id}/summary
```

**Path Parameters**

| Parameter   | Type   | Description                |
| ----------- | ------ | -------------------------- |
| `user_id` | string | Platform player identifier |

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

### 5. List Player Transactions

Returns a paginated list of bonus grant transactions for a player, ordered by most recent first. Each item shows a summary with a derived lifecycle status.

```
GET /api/v1/player-bonuses/{user_id}/transactions
```

**Path Parameters**

| Parameter   | Type   | Description                |
| ----------- | ------ | -------------------------- |
| `user_id` | string | Platform player identifier |

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
| `grant`     | Bonus was granted to the player                 |
| `released`  | A bonus chunk moved from pending to released    |
| `consumed`  | A released chunk was consumed against a wager   |
| `expiry`    | A chunk or bonus expired before being consumed  |
| `forfeited` | The bonus was forfeited before full consumption |

---

### 6. Get Transaction Detail

Returns the full detail of a single bonus grant including all chunks, forfeit record (if any), and expiry events.

```
GET /api/v1/player-bonuses/{user_id}/transactions/{txn_id}
```

**Path Parameters**

| Parameter   | Type    | Description                                              |
| ----------- | ------- | -------------------------------------------------------- |
| `user_id` | string  | Platform player identifier                               |
| `txn_id`    | integer | Grant record ID (the `txn_id` from the transaction list) |

**Response `200 OK`**

```json
{
  "txn_id": 15,
  "user_id": "PLAYER_001",
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
| `user_id`         | string          | Player identifier                          |
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

### 7. Get Player Referral Code

Returns the referral code assigned to a player. This code can be shared with friends to track referral-driven bonus eligibility.

```
GET /api/v1/player-bonuses/{user_id}/referral-code
```

**Path Parameters**

| Parameter   | Type   | Description                |
| ----------- | ------ | -------------------------- |
| `user_id` | string | Platform player identifier |

**Response `200 OK`**

```json
{
  "user_id": "PLAYER_001",
  "referral_code": "REF_XYZ99"
}
```

**Response Fields**

| Field           | Type   | Description                                  |
| --------------- | ------ | -------------------------------------------- |
| `user_id`     | string | Player identifier                            |
| `referral_code` | string | Unique referral code assigned to this player |

**Error Cases**

| HTTP Status | Scenario                               |
| ----------- | -------------------------------------- |
| `404`       | No referral code found for `user_id` |

---

## Error Responses

All errors follow a consistent envelope:

```json
{
  "detail": "Human-readable error message"
}
```

| HTTP Status                 | Scenario                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `400 Bad Request`           | Request validation failed (missing fields, out-of-range values)                                                                    |
| `404 Not Found`             | The referenced bonus grant, chunk, or consumption record does not exist, or does not belong to the given player                    |
| `409 Conflict`              | Duplicate consumption (`consume_txn_id` already recorded), no released chunk available for player, or consumption already reverted |
| `500 Internal Server Error` | Unexpected database error                                                                                                          |

---

## Integration Flow

```
1. Player initiates a deposit / game round
       │
       ▼
2. Call GET /api/v1/player-bonuses/applicable-codes?user_id=&chip_type=
   → Display eligible bonus offers to the player
       │
       ▼
3. Player selects a code
   → POST /api/v1/player-bonuses/apply-code?user_id=&promo_code=  { txn_amount, chip_type }
   → Returns grant_id — bonus grant created in PENDING status
       │
       ▼
4. Release triggers fire (event-driven, internal)
   → Chunks move from PENDING → RELEASE as player meets trigger conditions
       │
       ▼
5. Player wagers using released bonus
   → POST /api/v1/player-bonuses/consume  { user_id, consume_txn_id, bonus_amount, wager_amount, wager_tnx_id, ... }
       │
       ▼
6. If wager is voided:
     POST /api/v1/player-bonuses/consume/{consume_txn_id}/revert
       │
       ▼
6. Display wallet / history:
     GET /api/v1/player-bonuses/{user_id}/summary
     GET /api/v1/player-bonuses/{user_id}/transactions?chip_type=cash
     GET /api/v1/player-bonuses/{user_id}/transactions/{txn_id}
```

---

## Notes

- All monetary values are **decimal strings** to avoid floating-point precision loss. Parse with a `Decimal` or equivalent type in your language.
- All timestamps are **UTC** in ISO 8601 format (`YYYY-MM-DDTHH:MM:SS`).
- The `consume_txn_id` field is your idempotency key. Generate it on your side (e.g. a transaction UUID) and store it before calling the API so you can detect duplicate calls on retry. Pass the same value to the revert endpoint to cancel a consumption.
- A chunk must be in `RELEASE` status before it can be consumed. The chunk status transitions: `PENDING → RELEASE → CONSUMED / EXPIRED`.
