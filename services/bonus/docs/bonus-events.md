# Bonus Events

Events consumed by the bonus service to evaluate eligibility, trigger grants, and update wager progress. All events share the standard PAM envelope (see [`docs/event-schema.md`](../../../docs/event-schema.md)).

## Envelope (common to all events)

```json
{
  "event_id": "uuid-v4",
  "event_name": "snake_case_event_name",
  "schema_version": 1,
  "project_id": "proj_abc123",
  "user_id": "user_001",
  "session_id": "sess_optional",
  "timestamp": "2026-05-14T10:00:00.000Z",
  "received_at": "2026-05-14T10:00:00.123Z",
  "sdk": { "name": "pam-web", "version": "1.0.0" },
  "device": { "platform": "web", "os": "android", "ua": "..." },
  "properties": {}
}
```

---

## Player Action Events

### `LOGIN`
Player successfully logs in.

| Property | Type | Required | Notes |
|---|---|---|---|
| `login_method` | string | yes | `email`, `phone`, `google`, `apple`, etc. |
| `ip` | string | no | PII — hashed before storage. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000001",
  "event_name": "LOGIN",
  "schema_version": 1,
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
New player account created.

| Property | Type | Required | Notes |
|---|---|---|---|
| `registration_method` | string | yes | `email`, `phone`, `google`, `apple`. |
| `referral_code` | string | no | Promo or referral code used at sign-up. |
| `ip` | string | no | PII — hashed before storage. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000002",
  "event_name": "REGISTRATION",
  "schema_version": 1,
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

### `EMAILVERIFICATION`
Player verifies their email address.

| Property | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | PII — hashed before storage. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000003",
  "event_name": "EMAILVERIFICATION",
  "schema_version": 1,
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T08:05:00.000Z",
  "properties": {
    "email": "player@example.com"
  }
}
```

---

### `MOBILEVERIFICATION`
Player verifies their mobile number.

| Property | Type | Required | Notes |
|---|---|---|---|
| `phone` | string | yes | PII — hashed before storage. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000004",
  "event_name": "MOBILEVERIFICATION",
  "schema_version": 1,
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T08:06:00.000Z",
  "properties": {
    "phone": "+919876543210"
  }
}
```

---

### `EMAIL_AND_MOBILE_VERIFY`
Player completes both email and mobile verification in a single step (e.g. OTP flow that covers both).

| Property | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | PII — hashed before storage. |
| `phone` | string | yes | PII — hashed before storage. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000005",
  "event_name": "EMAIL_AND_MOBILE_VERIFY",
  "schema_version": 1,
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T08:07:00.000Z",
  "properties": {
    "email": "player@example.com",
    "phone": "+919876543210"
  }
}
```

---

### `KYC_VERIFIED`
Player's KYC (know-your-customer) documents are approved.

| Property | Type | Required | Notes |
|---|---|---|---|
| `kyc_level` | string | yes | `BASIC`, `FULL`. |
| `verified_by` | string | no | System or operator ID that approved. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000006",
  "event_name": "KYC_VERIFIED",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T09:00:00.000Z",
  "properties": {
    "kyc_level": "FULL",
    "verified_by": "system"
  }
}
```

---

## Deposit Events

### `DEPOSIT`
Player completes a deposit (any deposit, not necessarily the first).

| Property | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | yes | Idempotent per project. |
| `amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `payment_method` | string | yes | `upi`, `netbanking`, `card`, `wallet`. |
| `deposit_count` | int | no | Cumulative deposit count for this player including this one. |

```json
{
  "event_id": "76b689f2-e56a-480d-8c4a-21614a896b57",
  "event_name": "DEPOSIT",
  "schema_version": 1,
  "user_id": "user_001",
  "session_id": "sess_6b31a39f",
  "timestamp": "2026-05-14T11:58:41.459Z",
  "properties": {
    "order_id": "dep_48758cbbceaf",
    "amount": 3570.05,
    "currency": "INR",
    "payment_method": "upi",
    "deposit_count": 3
  }
}
```

---

### `FIRST_DEPOSIT`
Player makes their very first deposit. Published alongside `DEPOSIT` when `deposit_count == 1`.

| Property | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | yes | Same `order_id` as the associated `DEPOSIT` event. |
| `amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `payment_method` | string | yes | `upi`, `netbanking`, `card`, `wallet`. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000008",
  "event_name": "FIRST_DEPOSIT",
  "schema_version": 1,
  "user_id": "user_001",
  "session_id": "sess_6b31a39f",
  "timestamp": "2026-05-14T11:58:41.459Z",
  "properties": {
    "order_id": "dep_48758cbbceaf",
    "amount": 3570.05,
    "currency": "INR",
    "payment_method": "upi"
  }
}
```

---

## Referral Events (Referrer side)

Events emitted when a player who referred a friend achieves a qualifying milestone via that friend.

### `FRIEND_SIGNUP`
A friend referred by this player completes registration.

| Property | Type | Required | Notes |
|---|---|---|---|
| `friend_user_id` | string | yes | User ID of the friend who signed up. |
| `referral_code` | string | yes | Code used by the friend at sign-up. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000010",
  "event_name": "FRIEND_SIGNUP",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T12:00:00.000Z",
  "properties": {
    "friend_user_id": "user_002",
    "referral_code": "REF_XYZ99"
  }
}
```

---

### `FRIEND_DEPOSIT`
A referred friend makes any deposit.

| Property | Type | Required | Notes |
|---|---|---|---|
| `friend_user_id` | string | yes | User ID of the friend who deposited. |
| `order_id` | string | yes | Friend's deposit order ID. |
| `amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000011",
  "event_name": "FRIEND_DEPOSIT",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T12:30:00.000Z",
  "properties": {
    "friend_user_id": "user_002",
    "order_id": "dep_99aabbcc",
    "amount": 500.00,
    "currency": "INR"
  }
}
```

---

### `FRIEND_FIRSTDEPOSIT`
A referred friend makes their first deposit.

| Property | Type | Required | Notes |
|---|---|---|---|
| `friend_user_id` | string | yes | User ID of the friend. |
| `order_id` | string | yes | Friend's deposit order ID. |
| `amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000012",
  "event_name": "FRIEND_FIRSTDEPOSIT",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T12:30:00.000Z",
  "properties": {
    "friend_user_id": "user_002",
    "order_id": "dep_99aabbcc",
    "amount": 500.00,
    "currency": "INR"
  }
}
```

---

### `FRIEND_EMAILVERIFICATION`
A referred friend verifies their email.

| Property | Type | Required | Notes |
|---|---|---|---|
| `friend_user_id` | string | yes | User ID of the friend. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000013",
  "event_name": "FRIEND_EMAILVERIFICATION",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T12:05:00.000Z",
  "properties": {
    "friend_user_id": "user_002"
  }
}
```

---

### `FRIEND_MOBILEVERIFICATION`
A referred friend verifies their mobile number.

| Property | Type | Required | Notes |
|---|---|---|---|
| `friend_user_id` | string | yes | User ID of the friend. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000014",
  "event_name": "FRIEND_MOBILEVERIFICATION",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T12:06:00.000Z",
  "properties": {
    "friend_user_id": "user_002"
  }
}
```

---

### `FRIEND_KYC_VERIFIED`
A referred friend completes KYC.

| Property | Type | Required | Notes |
|---|---|---|---|
| `friend_user_id` | string | yes | User ID of the friend. |
| `kyc_level` | string | yes | `BASIC`, `FULL`. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000015",
  "event_name": "FRIEND_KYC_VERIFIED",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T13:00:00.000Z",
  "properties": {
    "friend_user_id": "user_002",
    "kyc_level": "FULL"
  }
}
```

---

## Referral Events (Referee side)

Events emitted on the **referee** player's (i.e. the referred friend's) account record. Distinct from the `FRIEND_*` series, which are emitted on the referrer's account.

### `REFEREE_SIGNUP`
This player signed up using a referral code.

| Property | Type | Required | Notes |
|---|---|---|---|
| `referrer_user_id` | string | yes | User ID of the player who referred them. |
| `referral_code` | string | yes | Code used at sign-up. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000020",
  "event_name": "REFEREE_SIGNUP",
  "schema_version": 1,
  "user_id": "user_002",
  "timestamp": "2026-05-14T12:00:00.000Z",
  "properties": {
    "referrer_user_id": "user_001",
    "referral_code": "REF_XYZ99"
  }
}
```

---

### `REFEREE_DEPOSIT`
This player (a referee) makes any deposit.

| Property | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | yes | Idempotent per project. |
| `amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `payment_method` | string | yes | `upi`, `netbanking`, `card`, `wallet`. |
| `referrer_user_id` | string | no | User ID of the referrer if known. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000021",
  "event_name": "REFEREE_DEPOSIT",
  "schema_version": 1,
  "user_id": "user_002",
  "session_id": "sess_referee01",
  "timestamp": "2026-05-14T12:30:00.000Z",
  "properties": {
    "order_id": "dep_99aabbcc",
    "amount": 500.00,
    "currency": "INR",
    "payment_method": "netbanking",
    "referrer_user_id": "user_001"
  }
}
```

---

### `REFEREE_FIRSTDEPOSIT`
This player (a referee) makes their first deposit.

| Property | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | yes | Idempotent per project. |
| `amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `payment_method` | string | yes | `upi`, `netbanking`, `card`, `wallet`. |
| `referrer_user_id` | string | no | User ID of the referrer if known. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000022",
  "event_name": "REFEREE_FIRSTDEPOSIT",
  "schema_version": 1,
  "user_id": "user_002",
  "session_id": "sess_referee01",
  "timestamp": "2026-05-14T12:30:00.000Z",
  "properties": {
    "order_id": "dep_99aabbcc",
    "amount": 500.00,
    "currency": "INR",
    "payment_method": "netbanking",
    "referrer_user_id": "user_001"
  }
}
```

---

### `REFEREE_EMAILVERIFICATION`
This player (a referee) verifies their email.

| Property | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | PII — hashed before storage. |
| `referrer_user_id` | string | no | User ID of the referrer if known. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000023",
  "event_name": "REFEREE_EMAILVERIFICATION",
  "schema_version": 1,
  "user_id": "user_002",
  "timestamp": "2026-05-14T12:05:00.000Z",
  "properties": {
    "email": "friend@example.com",
    "referrer_user_id": "user_001"
  }
}
```

---

### `REFEREE_MOBILEVERIFICATION`
This player (a referee) verifies their mobile number.

| Property | Type | Required | Notes |
|---|---|---|---|
| `phone` | string | yes | PII — hashed before storage. |
| `referrer_user_id` | string | no | User ID of the referrer if known. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000024",
  "event_name": "REFEREE_MOBILEVERIFICATION",
  "schema_version": 1,
  "user_id": "user_002",
  "timestamp": "2026-05-14T12:06:00.000Z",
  "properties": {
    "phone": "+919876543211",
    "referrer_user_id": "user_001"
  }
}
```

---

### `REFEREE__KYC_VERIFIED`
This player (a referee) completes KYC. Note: double underscore matches the upstream event name as-is.

| Property | Type | Required | Notes |
|---|---|---|---|
| `kyc_level` | string | yes | `BASIC`, `FULL`. |
| `referrer_user_id` | string | no | User ID of the referrer if known. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000025",
  "event_name": "REFEREE__KYC_VERIFIED",
  "schema_version": 1,
  "user_id": "user_002",
  "timestamp": "2026-05-14T13:00:00.000Z",
  "properties": {
    "kyc_level": "FULL",
    "referrer_user_id": "user_001"
  }
}
```

---

## Game Events

### `PREDICT_WIN`
Player wins a prediction/fantasy game.

| Property | Type | Required | Notes |
|---|---|---|---|
| `game_id` | string | yes | ID of the prediction round or contest. |
| `winnings_amount` | float | yes | Amount won in `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `rank` | int | no | Player's finishing rank in the contest. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000030",
  "event_name": "PREDICT_WIN",
  "schema_version": 1,
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T18:00:00.000Z",
  "properties": {
    "game_id": "game_predict_001",
    "winnings_amount": 1000.00,
    "currency": "INR",
    "rank": 1
  }
}
```

---

### `LeaderBoard Won`
Player wins or places in a leaderboard competition.

| Property | Type | Required | Notes |
|---|---|---|---|
| `leaderboard_id` | string | yes | ID of the leaderboard. |
| `rank` | int | yes | Player's final rank. |
| `prize_amount` | float | yes | In `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `period` | string | yes | Leaderboard period: `DAILY`, `WEEKLY`, `MONTHLY`. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000031",
  "event_name": "LeaderBoard Won",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T23:59:00.000Z",
  "properties": {
    "leaderboard_id": "lb_weekly_001",
    "rank": 2,
    "prize_amount": 5000.00,
    "currency": "INR",
    "period": "WEEKLY"
  }
}
```

---

## Operator / System Events

### `MANUAL_BONUS`
An operator manually grants a bonus to a player outside the normal trigger flow.

| Property | Type | Required | Notes |
|---|---|---|---|
| `bonus_configure_id` | int | yes | ID from `bonus_configure`. |
| `amount` | float | yes | Bonus amount in `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `operator_id` | string | yes | Operator who issued the grant. |
| `reason` | string | no | Free-text justification. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000040",
  "event_name": "MANUAL_BONUS",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T14:00:00.000Z",
  "properties": {
    "bonus_configure_id": 7,
    "amount": 200.00,
    "currency": "INR",
    "operator_id": "ops_admin_01",
    "reason": "Goodwill gesture — support ticket #4821"
  }
}
```

---

### `BULK_MANUAL_BONUS`
Operator grants a bonus to a batch of players at once (e.g. CSV upload campaign).

| Property | Type | Required | Notes |
|---|---|---|---|
| `bonus_configure_id` | int | yes | ID from `bonus_configure`. |
| `amount` | float | yes | Per-player bonus amount in `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |
| `batch_id` | string | yes | Identifies the bulk upload batch; same for all players in one operation. |
| `operator_id` | string | yes | Operator who triggered the batch. |
| `reason` | string | no | Free-text justification. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000041",
  "event_name": "BULK_MANUAL_BONUS",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T15:00:00.000Z",
  "properties": {
    "bonus_configure_id": 12,
    "amount": 100.00,
    "currency": "INR",
    "batch_id": "batch_20260514_001",
    "operator_id": "ops_admin_01",
    "reason": "May Day promotional campaign"
  }
}
```

---

### `BONUS_EXPIRED`
A bonus (or chunk) has expired before its conditions were met. Emitted by the bonus service scheduler.

| Property | Type | Required | Notes |
|---|---|---|---|
| `grant_id` | string | yes | `player_bonus_grant` ID. |
| `chunk_id` | string | no | Chunk ID if a specific chunk expired; omit if the whole bonus expired. |
| `expired_at` | ISO 8601 UTC | yes | Exact expiry timestamp. |
| `expiry_type` | string | yes | `CHUNK` or `CREDIT`. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000042",
  "event_name": "BONUS_EXPIRED",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T23:59:59.000Z",
  "properties": {
    "grant_id": "grant_abc001",
    "chunk_id": "chunk_001",
    "expired_at": "2026-05-14T23:59:59.000Z",
    "expiry_type": "CHUNK"
  }
}
```

---

### `Wait time Bonus`
A time-based bonus triggered after a player has been idle or waiting for a configured duration.

| Property | Type | Required | Notes |
|---|---|---|---|
| `bonus_configure_id` | int | yes | ID from `bonus_configure`. |
| `wait_duration_seconds` | int | yes | How long the player waited before the bonus fires. |
| `amount` | float | yes | Bonus amount in `currency` units. |
| `currency` | string (ISO 4217) | yes | e.g. `INR`. |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000043",
  "event_name": "Wait time Bonus",
  "schema_version": 1,
  "user_id": "user_001",
  "timestamp": "2026-05-14T16:00:00.000Z",
  "properties": {
    "bonus_configure_id": 9,
    "wait_duration_seconds": 86400,
    "amount": 50.00,
    "currency": "INR"
  }
}
```

---

## Event → Trigger Mapping

This table maps each event to which `bonus_release_trigger` values in `bonus_configure` it satisfies.

| Event | Trigger type in `bonus_release_trigger` |
|---|---|
| `LOGIN` | `LOGIN` |
| `REGISTRATION` | `REGISTRATION` |
| `EMAILVERIFICATION` | `EMAILVERIFICATION` |
| `MOBILEVERIFICATION` | `MOBILEVERIFICATION` |
| `EMAIL_AND_MOBILE_VERIFY` | `EMAIL_AND_MOBILE_VERIFY` |
| `KYC_VERIFIED` | `KYC_VERIFIED` |
| `DEPOSIT` | `DEPOSIT` |
| `FIRST_DEPOSIT` | `FIRST_DEPOSIT` |
| `FRIEND_SIGNUP` | `FRIEND_SIGNUP` |
| `FRIEND_DEPOSIT` | `FRIEND_DEPOSIT` |
| `FRIEND_FIRSTDEPOSIT` | `FRIEND_FIRSTDEPOSIT` |
| `FRIEND_EMAILVERIFICATION` | `FRIEND_EMAILVERIFICATION` |
| `FRIEND_MOBILEVERIFICATION` | `FRIEND_MOBILEVERIFICATION` |
| `FRIEND_KYC_VERIFIED` | `FRIEND_KYC_VERIFIED` |
| `REFEREE_SIGNUP` | `REFEREE_SIGNUP` |
| `REFEREE_DEPOSIT` | `REFEREE_DEPOSIT` |
| `REFEREE_FIRSTDEPOSIT` | `REFEREE_FIRSTDEPOSIT` |
| `REFEREE_EMAILVERIFICATION` | `REFEREE_EMAILVERIFICATION` |
| `REFEREE_MOBILEVERIFICATION` | `REFEREE_MOBILEVERIFICATION` |
| `REFEREE__KYC_VERIFIED` | `REFEREE__KYC_VERIFIED` |
| `PREDICT_WIN` | `PREDICT_WIN` |
| `LeaderBoard Won` | `LEADERBOARD_WON` |
| `MANUAL_BONUS` | `MANUAL` |
| `BULK_MANUAL_BONUS` | `MANUAL` |
| `Wait time Bonus` | `WAIT_TIME` |
| `BONUS_EXPIRED` | System-internal; does not trigger grants — drives expiry lifecycle. |

---

## PII fields

The following properties are PII and **must be hashed (SHA-256 with project salt) before persistence**:

- `email`, `phone`, `ip`

Raw values may transit `api-service` over TLS but must never be logged or written to ClickHouse / MongoDB unhashed.
