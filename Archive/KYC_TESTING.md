# KYC Events Testing Guide

## Quick Summary of KYC Implementation

✅ **5 KYC Event Types Added:**
1. `KYC Initiated` - User starts KYC process
2. `KYC Documents Uploaded` - User uploads ID docs
3. `KYC Completed (Success)` - Verification approved
4. `KYC Completed (Failed)` - Verification rejected
5. `KYC Cancelled` - User cancels the process

✅ **Canonical Event Mappings:**
- Supports multiple client naming conventions
- Client1: `KYCInitiated`, `KYCUploaded`, `KYCCompleted`, `KYCCancelled`
- Client2: `VerificationStarted`, `DocumentsUploaded`, `VerificationComplete`, `VerificationCancelled`
- All map to canonical events: `kyc.initiated`, `kyc.uploaded`, `kyc.completed`, `kyc.cancelled`

✅ **7 New Rules (worker/rules.py):**
- Rule 3: `kyc_initiated_query()` - Trigger KYC welcome email
- Rule 4: `kyc_documents_uploaded_query()` - Trigger verification notification
- Rule 5: `kyc_completed_success_query()` - Trigger success celebration
- Rule 6: `kyc_completed_failed_query()` - Trigger retry prompt
- Rule 7: `kyc_cancelled_query()` - Trigger cancellation feedback

✅ **Integration Points:**
- API: Accepts KYC events via `/track` endpoint
- Worker: Processes KYC events, flattens properties, evaluates rules
- Database: Stores raw events + flattened properties (event_props table)
- Dedupe: Prevents duplicate KYC events

---

## Test Data Included

`client/send_events.py` now includes 13 sample KYC events:

### Scenario 1: Successful KYC (User u2)
```
KYCInitiated → KYCUploaded → KYCCompleted (status=success)
[RULE 3 fires] → [RULE 4 fires] → [RULE 5 fires]
```

### Scenario 2: Failed KYC (User u3)
```
KYCInitiated → KYCUploaded → KYCCompleted (status=failed)
[RULE 6 fires]
```

### Scenario 3: Cancelled KYC (User u4)
```
KYCInitiated → KYCCancelled
[RULE 7 fires]
```

### Scenario 4: Client2 Variations (User u5)
```
VerificationStarted → DocumentsUploaded → VerificationComplete (status=success)
[Canonical mapping converts to kyc.* events]
```

---

## Prerequisites

Before testing, ensure:

1. **API Server Running:**
   ```bash
   cd d:\PAM
   .\.venv\Scripts\activate
   uvicorn app.main:app --reload --port 8000
   ```

2. **RabbitMQ Running:**
   ```bash
   # Option 1: Docker (if Docker daemon is available)
   docker-compose up -d
   
   # Option 2: RabbitMQ service on Windows
   # Start RabbitMQ service from Services app
   ```

3. **Worker Consumer Running (in another terminal):**
   ```bash
   cd d:\PAM
   .\.venv\Scripts\activate
   python worker/consumer.py
   ```

4. **ClickHouse Available:**
   - Remote instance at 13.232.222.144:8123
   - Database `poc` created via `setup_clickhouse.py`

---

## Testing Procedures

### Option A: Send All KYC Test Events

```bash
cd d:\PAM
.\.venv\Scripts\activate
python client/send_events.py
```

**Expected Output:**
```
200 {'status': 'ok', 'event_id': '...', 'canonical_event': 'kyc.initiated', 'enqueued': True}
200 {'status': 'ok', 'event_id': '...', 'canonical_event': 'kyc.uploaded', 'enqueued': True}
...
```

**Worker Output (worker/consumer.py terminal):**
```
[DEDUPE] Event 1234... is new, processing
[FLATTENED] kyc_type=basic, initiated_via=mobile_app, country=IN
[INSERT PROPS] 3 properties inserted
[RULE] User u2 initiated KYC => TRIGGER kyc_welcome_email
[RULE] User u2 uploaded KYC documents => TRIGGER kyc_verify_notification
[RULE] User u2 KYC verified (success) => TRIGGER kyc_success_celebration
[DEDUPE] Event 5678... is new, processing
[FLATTENED] status=failed, failure_reason=document_quality_low
[RULE] User u3 KYC rejected (failed) => TRIGGER kyc_failed_retry_prompt
...
```

### Option B: Test Individual KYC Events

**Send KYC Initiated Event:**
```bash
curl -X POST http://localhost:8000/track \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client1",
    "user_id": "test_user_1",
    "event_name": "KYCInitiated",
    "event_time": "2026-04-19T12:00:00Z",
    "properties": {
      "kyc_type": "basic",
      "initiated_via": "mobile_app",
      "country": "IN"
    }
  }'
```

**Send KYC Completed (Success):**
```bash
curl -X POST http://localhost:8000/track \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client1",
    "user_id": "test_user_1",
    "event_name": "KYCCompleted",
    "event_time": "2026-04-19T12:05:00Z",
    "properties": {
      "status": "success",
      "verification_score": 98,
      "verified_name": "Test User"
    }
  }'
```

**Send KYC Completed (Failed):**
```bash
curl -X POST http://localhost:8000/track \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client1",
    "user_id": "test_user_2",
    "event_name": "KYCCompleted",
    "event_time": "2026-04-19T12:10:00Z",
    "properties": {
      "status": "failed",
      "failure_reason": "document_quality_low",
      "verification_score": 45
    }
  }'
```

### Option C: Test Segmentation (Find All KYC-Verified Users)

Once events are processed, query verified users:

```bash
curl -X POST http://localhost:8000/segment/users \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client1",
    "canonical_event": "kyc.completed"
  }'
```

Response shows all users who completed KYC.

---

## Verification Steps

### 1. Check Events in Database

**Via ClickHouse (using curl):**
```bash
curl "http://13.232.222.144:8123/?query=SELECT%20*%20FROM%20poc.events_raw%20WHERE%20canonical_event%20LIKE%20%27kyc.%25%27%20LIMIT%205"
```

**Or via ClickHouse CLI:**
```sql
SELECT 
  client_id, 
  user_id, 
  event_name, 
  canonical_event, 
  event_time 
FROM poc.events_raw 
WHERE canonical_event LIKE 'kyc.%' 
ORDER BY ingest_time DESC 
LIMIT 10;
```

### 2. Check Flattened Properties

```sql
SELECT DISTINCT key 
FROM poc.event_props 
WHERE canonical_event LIKE 'kyc.%' 
LIMIT 20;
```

Expected keys: `kyc_type`, `status`, `verification_score`, `failure_reason`, etc.

### 3. Check Rule Evaluation

Look for worker output mentioning KYC rules:
```
[RULE] User ... KYC verified (success) => TRIGGER ...
[RULE] User ... KYC rejected (failed) => TRIGGER ...
[RULE] User ... initiated KYC => TRIGGER ...
```

### 4. Test Duplicate Detection

Send the **same** event twice with identical event_id:

```bash
# Send first time
curl -X POST http://localhost:8000/track \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client1",
    "user_id": "dedup_test",
    "event_name": "KYCInitiated",
    "event_time": "2026-04-19T12:00:00Z",
    "properties": {"kyc_type": "basic"}
  }'
# Returns: event_id = abc-123

# Send again (same event_id)
# Would expect:
# [DEDUPE] Skipping duplicate event: abc-123
```

---

## Debugging Issues

### Issue: API returns 500 "Failed to enqueue event"

**Cause:** RabbitMQ not running

**Fix:**
```bash
# Start RabbitMQ
docker-compose up -d

# Or check RabbitMQ status
rabbitmq-diagnostics ping
```

### Issue: Worker shows no output

**Cause:** Consumer not running or not consuming messages

**Fix:**
```bash
# Terminal 1: Start API
uvicorn app.main:app --reload --port 8000

# Terminal 2: Start Worker
python worker/consumer.py

# Terminal 3: Send events
python client/send_events.py
```

### Issue: ClickHouse error "Database poc does not exist"

**Fix:**
```bash
python setup_clickhouse.py
```

### Issue: Canonical event is "custom.kycinitiated" instead of "kyc.initiated"

**Cause:** Mapping missing from `config/canonical_map.json`

**Fix:** Mapping is already added for both client1 and client2 KYC events. Restart API:
```bash
# Kill previous API server and restart
uvicorn app.main:app --reload --port 8000
```

---

## Expected Rule Firing

When all KYC test events are sent, expect:

| Rule | User | Event | Status | Trigger |
|------|------|-------|--------|---------|
| Rule 3 | u2 | KYCInitiated | 🔥 Fires | kyc_welcome_email |
| Rule 4 | u2 | KYCUploaded | 🔥 Fires | kyc_verify_notification |
| Rule 5 | u2 | KYCCompleted (success) | 🔥 Fires | kyc_success_celebration |
| Rule 6 | u3 | KYCCompleted (failed) | 🔥 Fires | kyc_failed_retry_prompt |
| Rule 7 | u4 | KYCCancelled | 🔥 Fires | kyc_cancellation_feedback |
| Rule 5 | u5 (client2) | VerificationComplete (success) | 🔥 Fires | kyc_success_celebration |

---

## Files Modified/Created

### Modified:
- `config/canonical_map.json` - Added 8 KYC event mappings
- `worker/rules.py` - Added 7 KYC rule functions
- `worker/consumer.py` - Integrated KYC rule evaluation
- `client/send_events.py` - Added 13 sample KYC events

### Created:
- `KYC_IMPLEMENTATION.md` - Detailed KYC documentation
- `KYC_TESTING.md` - This file

### Unchanged (backward compatible):
- `app/main.py` - No breaking changes
- `app/schemas.py` - No breaking changes
- `worker/flatten.py` - No breaking changes
- `worker/dedupe.py` - No breaking changes
- Database schema - No changes needed

---

## Next Steps

Once KYC events are flowing:

1. **Advance KYC Rules:** Combine KYC with money events
   ```python
   # Example: "Users who are verified AND have high deposits"
   kyc_verified_with_deposits_query()
   ```

2. **KYC Status Webhooks:** Send real-time updates
   ```python
   # Example: POST to external service when KYC succeeds
   webhook_url = "https://partner.example.com/kyc-success"
   ```

3. **Analytics Dashboard:** Track KYC funnel
   - % users initiated KYC
   - % users uploaded docs
   - % users completed successfully
   - Failure rate by reason
   - Time spent in each stage

4. **Automation Triggers:**
   - SMS when KYC fails
   - Push notification when verified
   - Email with next steps

---

## Configuration Reference

### Canonical Event Names (All KYC)
```
kyc.initiated      → User started KYC
kyc.uploaded       → User uploaded documents
kyc.completed      → KYC verification finished (check status property)
kyc.cancelled      → User cancelled KYC
```

### Status Values in kyc.completed
```
status="success"   → Verification approved
status="failed"    → Verification rejected
```

### Sample Properties Structure
```python
# KYC Initiated
{
    "kyc_type": "basic" | "enhanced",
    "initiated_via": "mobile_app" | "web",
    "country": "IN"
}

# KYC Uploaded
{
    "document_types": ["aadhar", "selfie"],
    "upload_count": 2,
    "file_sizes_kb": [512, 256]
}

# KYC Completed
{
    "status": "success" | "failed",
    "verification_score": 95,
    "verified_name": "John Doe",          # if success
    "failure_reason": "document_quality_low"  # if failed
}

# KYC Cancelled
{
    "cancellation_reason": "user_initiated",
    "time_in_flow_seconds": 120
}
```
