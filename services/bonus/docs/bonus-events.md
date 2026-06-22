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

## Player Action Events

### `LOGIN`

Player successfully logs in.

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

New player account created.

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
    "referral_code": "PROMO50",
    "promo_code": "FIRST001"
  }
}
```

---

### `APP_VISIT`

Player opens or resumes the app.

| Property      | Type | Required | Notes                                                      |
| ------------- | ---- | -------- | ---------------------------------------------------------- |
| `visit_count` | int  | no       | Cumulative visit count for this player including this one. |

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

### `DEPOSIT_SUCCESS`

Player completes a deposit. Set `is_ftd: true` when this is the player's first ever deposit — the trigger system uses this flag to evaluate first-deposit bonus rules.

| Property         | Type              | Required | Notes                                                        |
| ---------------- | ----------------- | -------- | ------------------------------------------------------------ |
| `order_id`       | string            | yes      | Idempotent per project.                                      |
| `amount`         | decimal           | yes      | Exact settled value; 4-decimal precision.                    |
| `currency`       | string (ISO 4217) | yes      | e.g. `INR`.                                                  |
| `payment_method` | string            | yes      | `upi`, `netbanking`, `card`, `wallet`.                       |
| `is_ftd`         | bool              | yes      | `true` if this is the player's first deposit.                |
| `deposit_count`  | int               | no       | Cumulative deposit count for this player including this one. |

```json
{
  "event_id": "76b689f2-e56a-480d-8c4a-21614a896b57",
  "event_name": "DEPOSIT_SUCCESS",
  "user_id": "user_001",
  "session_id": "sess_6b31a39f",
  "timestamp": "2026-05-14T11:58:41.459Z",
  "properties": {
    "order_id": "dep_48758cbbceaf",
    "amount": "3570.0500",
    "currency": "INR",
    "payment_method": "upi",
    "is_ftd": false,
    "deposit_count": 3,
    "promo_code": "FIRST001"
  }
}
```

---

## Gameplay & Betting Events

### `BET_PLACED`

Emitted when any wager is accepted. Works for any product type — casino, sports, crash, fantasy, etc. Casino clients may still send the legacy `game_id` / `game_category` / `game_provider` fields; non-gaming clients use the generic `product_id` / `category` / `provider` equivalents.

| Property        | Type              | Required | Notes                                                                          |
| --------------- | ----------------- | -------- | ------------------------------------------------------------------------------ |
| `wager_amount`  | decimal           | yes      | Stake size; 4-decimal precision.                                               |
| `currency`      | string (ISO 4217) | yes      | e.g. `INR`.                                                                    |
| `balance_type`  | string            | yes      | Wallet source: `real`, `bonus`, or `freebet`.                                  |
| `product_id`    | string            | no       | Generic product / market / event reference. Casino clients use `game_id` here. |
| `category`      | string            | no       | Product vertical: `slots`, `sports`, `casino`, `crash`, etc.                   |
| `provider`      | string            | no       | Content or data provider name.                                                 |
| `game_id`       | string            | no       | Casino alias for `product_id` (accepted for backward compatibility).           |
| `game_category` | string            | no       | Casino alias for `category` (accepted for backward compatibility).             |
| `game_provider` | string            | no       | Casino alias for `provider` (accepted for backward compatibility).             |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000050",
  "event_name": "BET_PLACED",
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T19:00:00.000Z",
  "properties": {
    "wager_amount": "250.00",
    "currency": "INR",
    "balance_type": "bonus",
    "product_id": "match_12345",
    "category": "sports"
  }
}
```

---

### `WAGER`

General-purpose wager event for non-gaming clients (sports, fantasy, exchange, trading, etc.). This is a standalone event — it is **not** linked to `BET_PLACED` and does not carry outcome or settlement data. Use `BET_PLACED` for casino/gaming contexts; use `WAGER` for everything else.

| Property       | Type              | Required | Notes                                                        |
| -------------- | ----------------- | -------- | ------------------------------------------------------------ |
| `amount`       | decimal           | yes      | Stake size; 4-decimal precision.                             |
| `currency`     | string (ISO 4217) | yes      | e.g. `INR`.                                                  |
| `balance_type` | string            | yes      | Wallet source: `real`, `bonus`, or `freebet`.                |
| `product_id`   | string            | no       | Market / selection / event reference on the client platform. |
| `category`     | string            | no       | Product vertical: `sports`, `fantasy`, `exchange`, etc.      |
| `provider`     | string            | no       | Data or platform provider name.                              |

```json
{
  "event_id": "a1b2c3d4-0000-0000-0000-000000000051",
  "event_name": "WAGER",
  "user_id": "user_001",
  "session_id": "sess_abc123",
  "timestamp": "2026-05-14T19:01:30.000Z",
  "properties": {
    "amount": "250.0000",
    "currency": "INR",
    "balance_type": "real",
    "product_id": "match_12345_over_2_5",
    "category": "sports"
  }
}
```

---

## Game Events

### `LEADERBOARD_WON`

Player wins or places in a leaderboard competition.

| Property         | Type              | Required | Notes                                     |
| ---------------- | ----------------- | -------- | ----------------------------------------- |
| `leaderboard_id` | string            | yes      | ID of the leaderboard.                    |
| `rank`           | int               | yes      | Player's final rank.                      |
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

Player wins or places in a tournament.

| Property        | Type              | Required | Notes                                     |
| --------------- | ----------------- | -------- | ----------------------------------------- |
| `tournament_id` | string            | yes      | ID of the tournament.                     |
| `rank`          | int               | yes      | Player's final rank.                      |
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

A friend referred by this player completes registration.

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
| `WAGER`           | `WAGER`                              |
| `LEADERBOARD_WON` | `LEADERBOARD_WON`                    |
| `TOURNAMENT_WON`  | `TOURNAMENT_WON`                     |
| `FRIEND_SIGNUP`   | `FRIEND_SIGNUP`                      |

---

## PII fields

The following properties are PII and **must be hashed (SHA-256 with project salt) before persistence**:

- `email`, `phone`, `ip`

Raw values may transit `api-service` over TLS but must never be logged or written to ClickHouse / MongoDB unhashed.
