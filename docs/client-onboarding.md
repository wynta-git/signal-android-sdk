# Client Onboarding Guide

Step-by-step guide to enrolling a new client (project) in PAM. Covers every MongoDB document, Redis key, token, and API call required — in dependency order.

---

## Overview

Onboarding a new client requires exactly **two manual steps**:

1. Insert a `projects` document in MongoDB
2. Create an API token via the admin endpoint

Everything else (ClickHouse tables, Redis caches, col_maps, user profiles, indexes) is created automatically on first use.

---

## Prerequisites

You need an existing **admin token** (`scope: ["admin"]`) to call admin endpoints. If this is the very first project on the instance, bootstrap it directly via MongoDB + the seed script.

```
Admin token format: pam_live_<random32>
```

---

## Step 1 — Create the Project in MongoDB

**Collection:** `projects`

Insert one document. The `project_id` is the tenant identifier used across every service.

```js
{
  project_id:  "proj_acme",           // unique, lowercase, no spaces
  name:        "Acme Corp",           // human-readable label
  created_at:  ISODate(),
  settings: {
    pii_salt:         "<secrets.token_hex(32)>",  // random, unique per project
    timezone:         "Asia/Kolkata",              // default "UTC"
    retention_months: 13
  }
}
```

**Index** (created on service startup, verify it exists):
```js
{ project_id: 1 }  // unique
```

**Via the seed script** (recommended for first-time setup):
```bash
# From repo root
python scripts/seed_api_tokens.py
```

The script ([seed_api_tokens.py:37–61](../scripts/seed_api_tokens.py#L37-L61)) does the project insert + token creation in one pass, and is safe to re-run (upsert pattern).

**Important:** Generate `pii_salt` with `secrets.token_hex(32)`. Never reuse salts across projects. Never expose this value.

---

## Step 2 — Create an API Token

Tokens are scoped to one project and one environment (`live` or `test`).

### Via the admin HTTP endpoint

```http
POST /api/v1/events/admin/tokens
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "scope": ["events:write"],
  "env":   "live",
  "label": "Web SDK — Production"
}
```

**Response:**
```json
{
  "token_id":   "60d5ec49f1b2c72d8c8e9a1b",
  "token":      "pam_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456",
  "scope":      ["events:write"],
  "env":        "live",
  "label":      "Web SDK — Production",
  "created_at": "2026-06-02T10:30:00.000Z"
}
```

**Save the raw `token` value now — it is shown only once.** The system stores only the SHA-256 hash.

### What gets written to MongoDB

**Collection:** `tokens`

```js
{
  project_id:  "proj_acme",
  token_hash:  "<sha256 of raw token>",
  scope:       ["events:write"],
  status:      "active",
  label:       "Web SDK — Production",
  created_at:  ISODate(),
  last_used_at: null,
  revoked_at:  null
}
```

### Token scopes

| Scope | Can do |
|---|---|
| `events:write` | `POST /track`, `/identify`, `/alias` |
| `admin` | All of the above + all admin endpoints |

Create at minimum one `events:write` token for the client SDK and optionally one `admin` token for their dashboard/admin portal.

### Token format

```
pam_live_<random 32 chars>    ← production data
pam_test_<random 32 chars>    ← test/sandbox data
```

The `env` prefix is used by event-processor to route to the correct ClickHouse database.

---

## Step 3 — Hand Token to the Client

The client SDK uses the token as a Bearer token on every request:

```http
POST /api/v1/events/track
Authorization: Bearer pam_live_aBcDeFg...
Content-Type: application/json
```

The `project_id` is **never sent by the client** — it is derived server-side from the token. This enforces tenant isolation.

---

## What Gets Created Automatically (no manual action needed)

| Resource | Created when | Where |
|---|---|---|
| Redis token cache (`pam:token:{hash}`) | First API call with the token | `shared/auth/token.py:71` |
| ClickHouse table `pam.events_{project_id}` | First event reaches event-processor | `event-processor/app/schema_manager.py:228` |
| Redis col_map hash (`pam:col_map:{project_id}`) | First new property key seen | `event-processor/app/schema_manager.py:305` |
| MongoDB `col_maps` document | First new property key seen | `shared/clients/mongo.py` |
| MongoDB `users` document | First `/identify` call | `shared/clients/mongo.py` |
| MongoDB `trait_schemas` document | First `/identify` call | `shared/clients/mongo.py:752` |
| Per-minute rate limit counters | Each API request | Redis, 60 s TTL, auto-expire |

---

## Optional Step — Configure Field Aliases

If the client SDK sends property names that differ from the canonical names expected in queries/segments, set up field aliases.

```http
POST /api/v1/events/admin/field-aliases/{event_name}
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "aliases": {
    "amt":  "amount",
    "curr": "currency"
  }
}
```

**Collection:** `field_aliases`
```js
{
  project_id:  "proj_acme",
  event_name:  "purchase_completed",
  aliases:     { "amt": "amount", "curr": "currency" },
  updated_at:  ISODate()
}
```

The event-processor resolves aliases before writing to ClickHouse. Cached in-memory for 30 s per `(project_id, event_name)` pair.

---

## Optional Step — Configure Event Routes (Fanout)

If events from this client need to be published to additional Kafka topics (e.g. for a bonus engine, fraud detection), create event routes.

```http
POST /api/v1/events/admin/event-routes
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "topic":       "pam.bonus.v1",
  "event_names": ["bonus_awarded", "bonus_redeemed"]
}
```

**Collection:** `event_routes`
```js
{
  topic:       "pam.bonus.v1",
  event_names: ["bonus_awarded", "bonus_redeemed"],
  created_at:  ISODate()
}
```

This is **global** (not per-project). Only create it if a downstream consumer needs these events.

---

## Optional Step — Create Segments

After the client starts sending events and identifying users, segments can be created via the segmentation-engine.

```http
POST /internal/segments
Authorization: Bearer <admin-token>

{
  "project_id": "proj_acme",
  "segment_id": "seg_high_value",
  "name":       "High Value Users",
  "rules": { ... }
}
```

**Collection:** `segments` (MongoDB, segmentation-engine owns it)

---

## Admin Endpoint Reference

All admin endpoints require a token with `scope: ["admin"]`. The `project_id` comes from the token — never from the URL.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/events/admin/project` | Read project settings |
| `PATCH` | `/api/v1/events/admin/project` | Update timezone / retention |
| `POST` | `/api/v1/events/admin/tokens` | Create a new token |
| `GET` | `/api/v1/events/admin/tokens` | List all tokens for project |
| `DELETE` | `/api/v1/events/admin/tokens/{token_id}` | Revoke a token |
| `GET` | `/api/v1/events/admin/field-aliases` | List aliases |
| `POST` | `/api/v1/events/admin/field-aliases/{event_name}` | Create / replace aliases |
| `PATCH` | `/api/v1/events/admin/field-aliases/{event_name}` | Merge aliases |
| `GET` | `/api/v1/events/admin/event-routes` | List event routes |
| `POST` | `/api/v1/events/admin/event-routes` | Create event route |
| `DELETE` | `/api/v1/events/admin/event-routes/{topic}` | Delete event route |
| `GET` | `/api/v1/events/admin/users/{user_id}` | Get user profile |
| `DELETE` | `/api/v1/events/admin/users/{user_id}` | Delete user |

---

## MongoDB Collections Summary

| Collection | Owner | Created by |
|---|---|---|
| `projects` | Global | Manual (Step 1) |
| `tokens` | api-service | Admin API (Step 2) |
| `field_aliases` | api-service | Admin API (optional) |
| `event_routes` | api-service | Admin API (optional) |
| `users` | api-service | First `/identify` call |
| `trait_schemas` | api-service | First `/identify` call |
| `col_maps` | event-processor | First event with new property |
| `segments` | segmentation-engine | Segment API |
| `campaigns` | campaign-engine | Campaign API |
| `notification_deliveries` | notifications-engine | Auto on send |
| `device_tokens` | notifications-engine | Auto on push registration |

---

## Redis Keys for a New Client

No Redis setup is required. All keys are created and expired automatically:

| Key | TTL | Created by |
|---|---|---|
| `pam:token:{hash}` | 5 min | First API call (auth cache) |
| `pam:token:{hash}:revoked` | 1 hour | Token revoke endpoint |
| `pam:rate:proj:{project_id}:min:{epoch}` | 60 s | Each API request |
| `pam:rate:user:{project_id}:{user_id}:min:{epoch}` | 60 s | Each /track call |
| `pam:col_map:{project_id}` | No TTL (hash) | First new event property |
| `pam:schema_lock:{project_id}:{col}` | 30 s | DDL lock during column add |
| `pam:dedup:{project_id}:{event_id}` | 24 h | Each event write |
| `pam:idempotency:{project_id}:{key}` | 6 h | Idempotent request |

---

## Promoting Frequently-Used Properties to Typed Base Columns

By default, every `properties` key a client sends becomes a `Nullable(String)` dynamic column in ClickHouse. This is fine for most fields.

But if a property is **queried frequently** (filtered, aggregated, sorted), promote it to a typed base column instead. This avoids string casting on every query and makes the schema explicit.

### Decision rule

| Condition | Action |
|---|---|
| Queried with `SUM()`, `AVG()`, `WHERE >` — needs a real type | Promote |
| Present in most events for this client | Promote |
| Rare, one-off, or free-text | Leave as dynamic `Nullable(String)` |

### Choosing the right ClickHouse type

| Data | ClickHouse type |
|---|---|
| Decimal number (money, score) | `Nullable(Float64)` |
| Whole number (count, rank) | `Nullable(Int64)` |
| Short string, low cardinality (status, country, platform) | `LowCardinality(String)` |
| Short string, high cardinality (IDs, names) | `String` |
| Date/time | `Nullable(DateTime64(3, 'UTC'))` |
| True/false | `Nullable(UInt8)` |

### How to promote a property (4 places + ClickHouse)

For each property you want to promote, update all of the following. **Order matters — `_BASE_COLUMNS` and `_base_values()` must stay in sync.**

**1. `_BASE_COLUMNS`** — [event-processor/app/writer.py](../services/event-processor/app/writer.py)
```python
_BASE_COLUMNS = [
    ...
    "your_field",    # add here
]
```

**2. `_PROMOTED_KEYS`** — same file
```python
_PROMOTED_KEYS = frozenset({"amount", "currency", "your_field"})
```

**3. `_base_values()`** — same file, extract from `props` and add to the return list at the **same position** as `_BASE_COLUMNS`
```python
def _base_values(event):
    props = event.get("properties") or {}
    ...
    your_field_raw = props.get("your_field")
    ...
    return [
        ...
        str(your_field_raw) if your_field_raw is not None else None,   # add here
    ]
```

**4. `_CLIENT_TABLE_DDL`** — [event-processor/app/schema_manager.py](../services/event-processor/app/schema_manager.py)
```sql
your_field   LowCardinality(String),   -- or the right type
```

**5. ClickHouse `ALTER TABLE`** — for every existing client table
```sql
ALTER TABLE pam.events_{project_id}
    ADD COLUMN IF NOT EXISTS your_field LowCardinality(String) DEFAULT '';
```

### Example — promoting 3 fields from properties

Say a client sends `payment_method`, `transaction_id`, `loyalty_points` in every event and you query them constantly.

```python
# writer.py

_BASE_COLUMNS = [
    ...existing...,
    "payment_method",
    "transaction_id",
    "loyalty_points",
]

_PROMOTED_KEYS = frozenset({
    "amount", "currency",
    "payment_method", "transaction_id", "loyalty_points",
})

def _base_values(event):
    props = event.get("properties") or {}
    ...
    loyalty_raw = props.get("loyalty_points")
    loyalty: int | None = None
    if loyalty_raw is not None:
        try:
            loyalty = int(loyalty_raw)
        except (TypeError, ValueError):
            pass

    return [
        ...existing...,
        str(props.get("payment_method") or ""),
        str(props.get("transaction_id") or ""),
        loyalty,
    ]
```

```sql
-- schema_manager.py DDL
payment_method   LowCardinality(String),
transaction_id   String,
loyalty_points   Nullable(Int64),
```

```sql
-- Run on ClickHouse for each existing client table
ALTER TABLE pam.events_{project_id} ADD COLUMN IF NOT EXISTS payment_method LowCardinality(String) DEFAULT '';
ALTER TABLE pam.events_{project_id} ADD COLUMN IF NOT EXISTS transaction_id String DEFAULT '';
ALTER TABLE pam.events_{project_id} ADD COLUMN IF NOT EXISTS loyalty_points Nullable(Int64);
```

---

## Checklist

```
[ ] 1. Insert projects document (project_id, name, pii_salt, settings)
[ ] 2. Create admin token  → scope: ["admin"], env: "live"
[ ] 3. Create events:write token → scope: ["events:write"], env: "live"
[ ] 4. Review client's event structure — identify frequently-used properties
[ ] 5. Promote frequent properties to base columns (4 places + ALTER TABLE)
[ ] 6. Hand events:write token to client SDK
[ ] 7. Send a test /track event — verify 202 response
[ ] 8. Send a test /identify call — verify user appears in users collection
[ ] 9. (Optional) Configure field aliases if SDK property names differ
[ ] 10. (Optional) Create event routes for fanout topics
[ ] 11. (Optional) Create segments and campaigns
```

---

## Revoking / Offboarding a Client

```http
DELETE /api/v1/events/admin/tokens/{token_id}
Authorization: Bearer <admin-token>
```

This sets `status: "revoked"` in MongoDB and writes a Redis revocation flag with 1-hour TTL (`pam:token:{hash}:revoked`). Subsequent requests with the revoked token return **401** immediately, even within the 5-minute cache window.

To fully offboard: revoke all tokens, then manually delete the `projects` document and all associated collection documents for the `project_id`.
