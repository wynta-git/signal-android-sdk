# Copilot Memory / Handoff — Event Ingestion + Segmentation POC (FastAPI + RabbitMQ + ClickHouse)

**Date context:** 2026-04-19  
**Goal:** Build a small MoEngage-like POC that ingests generic events from multiple clients, stores them in ClickHouse, supports ad-hoc segmentation, and applies simple rules.

## Current Architecture (POC)

### Components
1. **Client script** (`client/send_events.py`) sends HTTP events to the ingest API.
2. **Ingest API** (FastAPI, `app/main.py`) validates/enriches, generates `event_id`, computes `canonical_event` (simple demo mapping), and publishes to RabbitMQ.
3. **Worker consumer** (`worker/consumer.py`) consumes events from RabbitMQ, writes to ClickHouse:
   - `poc.events_raw` — raw event record (source of truth, JSON stored)
   - `poc.event_props` — flattened EAV key/value properties for ad-hoc segmentation
4. **Rules** are evaluated in the worker using ClickHouse queries and currently print triggers to stdout.

### Why this design?
- Raw table preserves full payload.
- EAV table enables ad-hoc filters on arbitrary properties (without scanning/parsing JSON for every query).
- Optional canonicalization allows normalizing different client event names (Deposit vs MoneyTransferred vs credited) while preserving originals.

## External Services / Config

### ClickHouse
- Host: `10.2.2.24`
- Port: `8123` (HTTP)
- Database: `poc`
- Username: `default`
- Password: configured in `.env` as `CLICKHOUSE_PASSWORD`

### RabbitMQ
- Default: `amqp://guest:guest@localhost:5672/`
- Exchange: `events`
- Queue: `events_ingest`
- Routing key: `track`

## ClickHouse Schema (created manually)

### events_raw
Stores full JSON.
Columns: `client_id, user_id, event_id (UUID), event_time, event_name, canonical_event, props_json, ingest_time`

### event_props (EAV)
Stores flattened properties.
Columns: `client_id, user_id, event_id, event_time, event_name, key, value_string, value_number, value_bool, ingest_time`

## Current Event Payload Format (HTTP /track)

```json
{
  "client_id": "client1",
  "user_id": "u1",
  "event_name": "Deposit",
  "event_time": "2026-04-19T10:00:00Z",
  "properties": {
    "amount": 1000,
    "currency": "INR",
    "status": "success"
  }
}
```

Notes:
- `event_time` is optional; server fills UTC now if missing.
- `properties` is arbitrary JSON; nested dicts are flattened to dotted keys up to depth=3.
- lists are currently stored as strings (POC decision).

## Canonicalization (demo)
Hardcoded map in `app/main.py`:
- (client1, Deposit) -> `money.deposit`
- (client2, MoneyTransferred) -> `money.transfer`
- (client3, credited) -> `money.credit`
Fallback: `custom.<event_name_lower>`

## How to Run Locally (Developer Workflow)

### 1) Start RabbitMQ (local)
```bash
docker compose up -d
```

### 2) Python env
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3) Configure `.env`
Set ClickHouse password:
- `CLICKHOUSE_PASSWORD=...`

### 4) Run API
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5) Run worker
```bash
python -m worker.consumer
```

### 6) Send sample events
```bash
python client/send_events.py
```

Expected:
- Inserts into ClickHouse tables
- Worker prints rule triggers

## Demo Rule Logic (current)
- If `canonical_event == "money.deposit"` and user is in segment "high_value_inr_depositor" => print TRIGGER `campaign_x`
- If user has any `money.transfer` in last 7 days => print TRIGGER `webhook_y`

Segment example is implemented by grouping `event_props` by `event_id` and checking:
- amount >= 500
- currency == INR
- status in success-ish values

## IMPORTANT: What we want next
We want to improve the POC demo experience by adding API endpoints and making segmentation/rules more “product-like”.

---

# Copilot Chat Prompts to Continue (paste these in VS Code)

## Prompt 1 — Add Segmentation Endpoint
**Task:** Add a FastAPI endpoint `/segment/users` that returns a list of `user_id` matching ad-hoc filters.
**Requirements:**
- Inputs: `client_id`, `since_days` (default 30), `event_name` or `canonical_event` (optional), and a list of property predicates:
  - example predicate: `{ "key": "currency", "op": "eq", "value": "INR", "type": "string" }`
  - example predicate: `{ "key": "amount", "op": "gte", "value": 500, "type": "number" }`
- Implementation can query `poc.event_props` grouped by `(user_id, event_id)` and HAVING conditions.
- Keep it safe: validate ops; do not allow raw SQL injection.
- Return: JSON array of `user_id` (and optionally count).

## Prompt 2 — Add Rules Endpoint (Test Rule Evaluation)
**Task:** Add `/rules/evaluate` endpoint that accepts an event payload (same as /track) but does not enqueue; it should:
- compute canonical_event
- run rule evaluation logic against ClickHouse
- return which rules would fire (no side effects)

## Prompt 3 — Make Canonical Mapping Configurable
**Task:** Move `CANONICAL_EVENT_MAP` to a JSON file (e.g., `config/canonical_map.json`) loaded on startup.
- Hot reload not required for POC.
- Add example mappings for three clients.

## Prompt 4 — Improve Flattening
**Task:** Improve `flatten_properties`:
- store arrays as repeated rows with keys like `items[0].id` etc. OR store `key` multiple times with an `array_index` column (choose one).
- add unit tests for flattening (pytest).

## Prompt 5 — Dedupe Handling
**Task:** Add dedupe on `(client_id, event_id)`:
- Option A: ClickHouse constraint-like behavior isn’t native; implement “at least once” idempotency by checking existence before insert (acceptable at low volume).
- Option B: use `ReplacingMergeTree` on raw table (explain tradeoffs).
Implement A for POC.

---

# Constraints / Decisions (keep consistent)
- Keep raw payload in `events_raw.props_json`
- Use EAV table for ad-hoc segmentation
- Prefer simple, readable code over premature optimization (volume is tiny)
- Treat times as UTC
- Keep RabbitMQ usage for async pipeline

# Known Gaps (acceptable for POC)
- No auth/tenant isolation on API endpoints
- No dead-letter queue / retry policy
- No backfill pipeline
- No multi-region replication logic implemented (only explained conceptually)