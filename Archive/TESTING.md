# Testing Guide for PAM Event Ingestion POC

## Prerequisites

- Python 3.9+ (recommend 3.11)
- Docker & Docker Compose (for RabbitMQ)
- ClickHouse instance running on `10.2.2.24:8123` (or update `.env`)

## Setup Steps

### 1. Create Python Virtual Environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 3. Configure `.env`

Edit `.env` and set your ClickHouse password:

```env
CLICKHOUSE_PASSWORD=your_actual_password
```

### 4. Start RabbitMQ (Local)

```powershell
docker-compose up -d
```

Verify RabbitMQ is running:
- AMQP: http://localhost:5672
- Management UI: http://localhost:15672 (guest/guest)

```powershell
docker-compose ps
docker-compose logs rabbitmq
```

### 5. Run FastAPI Server

In a new terminal (with .venv activated):

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Visit: http://localhost:8000/docs (Swagger UI)

### 6. Run Worker (RabbitMQ Consumer)

In another terminal (with .venv activated):

```powershell
python -m worker.consumer
```

Expected output:
```
Worker consuming... Ctrl+C to stop
```

### 7. Send Test Events

In a third terminal (with .venv activated):

```powershell
python client/send_events.py
```

Expected outputs:
1. **Console from send_events.py** — HTTP 200 responses with event_ids
2. **Console from API** — UVicorn logs showing POST /track requests
3. **Console from Worker** — Messages like:
   ```
   [RULE] User u1 in segment high_value_inr_depositor => TRIGGER campaign_x
   [RULE] User u1 has recent transfer => TRIGGER webhook_y
   ```
4. **ClickHouse** — New rows in `poc.events_raw` and `poc.event_props` tables

---

## Testing API Endpoints

### Health Check

```bash
curl http://localhost:8000/healthz
```

Expected: `{"ok":true}`

### Track Event (Ingest)

```bash
curl -X POST http://localhost:8000/track \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client1",
    "user_id": "u42",
    "event_name": "Deposit",
    "properties": {
      "amount": 750,
      "currency": "INR",
      "status": "success"
    }
  }'
```

Expected: 
```json
{
  "status": "ok",
  "event_id": "uuid-here",
  "canonical_event": "money.deposit",
  "enqueued": true
}
```

### Segment Users (NEW)

```bash
curl -X POST http://localhost:8000/segment/users \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client1",
    "since_days": 30,
    "predicates": [
      {
        "key": "amount",
        "op": "gte",
        "value": 500,
        "type": "number"
      },
      {
        "key": "currency",
        "op": "eq",
        "value": "INR",
        "type": "string"
      }
    ]
  }'
```

Expected:
```json
{
  "user_ids": ["u1", "u42"],
  "count": 2
}
```

---

## Troubleshooting

### RabbitMQ Connection Errors

```
pika.exceptions.AMQPConnectionError
```

**Fix:**
```powershell
docker-compose up -d  # Make sure rabbitmq is running
docker-compose logs rabbitmq  # Check logs
```

### ClickHouse Connection Errors

```
ConnectionError: [Errno ...] Network is unreachable
```

**Fix:**
- Verify ClickHouse is accessible at 10.2.2.24:8123
- Or update CLICKHOUSE_HOST in `.env`
- Ensure CLICKHOUSE_PASSWORD is set correctly

### Worker Not Receiving Messages

**Check:**
1. API server is running and accepting /track requests
2. RabbitMQ is running (`docker-compose ps`)
3. Worker is consuming from correct queue name (in `.env`)

```powershell
# View RabbitMQ management UI
start http://localhost:15672
# Login: guest / guest
# Go to Queues tab to see "events_ingest"
```

### ClickHouse Tables Don't Exist

Tables must be created manually (POC):

```sql
-- In ClickHouse console:

CREATE TABLE IF NOT EXISTS poc.events_raw (
    client_id String,
    user_id String,
    event_id UUID,
    event_time DateTime,
    event_name String,
    canonical_event String,
    props_json String,
    ingest_time DateTime
) ENGINE = MergeTree()
ORDER BY (client_id, user_id, event_time);

CREATE TABLE IF NOT EXISTS poc.event_props (
    client_id String,
    user_id String,
    event_id UUID,
    event_time DateTime,
    event_name String,
    key String,
    value_string Nullable(String),
    value_number Nullable(Float64),
    value_bool Nullable(UInt8),
    ingest_time DateTime
) ENGINE = MergeTree()
ORDER BY (client_id, user_id, event_time, key);
```

---

## Quick Sanity Check (No External Services)

Test just the API without RabbitMQ/ClickHouse:

```powershell
# Just start the API
uvicorn app.main:app --port 8000

# In another terminal:
curl -X POST http://localhost:8000/track \
  -H "Content-Type: application/json" \
  -d '{"client_id":"c1","user_id":"u1","event_name":"Test"}'
```

This will fail when trying to publish to RabbitMQ (expected), but confirms the API is alive.

---

## Next Steps

Once this POC is working:
1. **Prompt 2** — Add `/rules/evaluate` endpoint (dry-run)
2. **Prompt 3** — Move canonical mapping to config file
3. **Prompt 4** — Improve array flattening + pytest
4. **Prompt 5** — Add dedupe logic
