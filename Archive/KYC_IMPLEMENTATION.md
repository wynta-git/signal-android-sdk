# KYC (Know Your Customer) Implementation

## Overview

The system now handles complete KYC (Know Your Customer) verification workflows with support for multiple event types and user journey tracking. This enables real-time KYC event processing, segmentation, and rule-based actions.

## Supported KYC Events

### 1. **KYC Initiated** (`kyc.initiated`)
- **Trigger**: User starts the KYC process
- **Client1 Event**: `KYCInitiated`
- **Client2 Event**: `VerificationStarted`
- **Action**: Send welcome email, explain requirements
- **Properties**:
  - `kyc_type`: "basic" or "enhanced"
  - `initiated_via`: "mobile_app", "web", etc.
  - `country`: User's country code

### 2. **KYC Documents Uploaded** (`kyc.uploaded`)
- **Trigger**: User uploads identity documents
- **Client1 Event**: `KYCUploaded`
- **Client2 Event**: `DocumentsUploaded`
- **Action**: Send verification notification, start processing
- **Properties**:
  - `document_types`: Array of doc types (aadhar, selfie, passport, etc.)
  - `upload_count`: Number of documents uploaded
  - `file_sizes_kb`: Sizes of uploaded files

### 3. **KYC Completed - Success** (`kyc.completed` + `status='success'`)
- **Trigger**: KYC verification approved
- **Client1 Event**: `KYCCompleted` with `status: "success"`
- **Client2 Event**: `VerificationComplete` with `status: "success"`
- **Action**: Unlock premium features, send success certificate
- **Properties**:
  - `status`: "success"
  - `verification_score`: 0-100 confidence
  - `verified_name`: User's verified name
  - `verified_dob`: Verified date of birth

### 4. **KYC Completed - Failed** (`kyc.completed` + `status='failed'`)
- **Trigger**: KYC verification rejected
- **Client1 Event**: `KYCCompleted` with `status: "failed"`
- **Action**: Request resubmission, offer support
- **Properties**:
  - `status`: "failed"
  - `failure_reason`: "document_quality_low", "mismatch", etc.
  - `verification_score`: Low score indicating issue

### 5. **KYC Cancelled** (`kyc.cancelled`)
- **Trigger**: User cancels KYC process
- **Client1 Event**: `KYCCancelled`
- **Client2 Event**: `VerificationCancelled`
- **Action**: Send feedback request, offer assistance
- **Properties**:
  - `cancellation_reason`: "user_initiated", "timeout", etc.
  - `time_in_flow_seconds`: How long user was in process

## Canonical Event Mapping

The system maps client-specific KYC event names to canonical events:

### Client1 Mappings
```json
{
  "KYCInitiated" → "kyc.initiated",
  "KYCUploaded" → "kyc.uploaded",
  "KYCCompleted" → "kyc.completed",
  "KYCCancelled" → "kyc.cancelled"
}
```

### Client2 Mappings
```json
{
  "VerificationStarted" → "kyc.initiated",
  "DocumentsUploaded" → "kyc.uploaded",
  "VerificationComplete" → "kyc.completed",
  "VerificationCancelled" → "kyc.cancelled"
}
```

All mappings are configured in `config/canonical_map.json` and automatically loaded on startup.

## KYC Rules

### Rule 3: KYC Initiated
```python
kyc_initiated_query(client_id, user_id)
```
- **Fires When**: User has initiated KYC
- **Action**: Send KYC welcome email with instructions
- **Use Case**: Onboarding, compliance tracking

### Rule 4: Documents Uploaded
```python
kyc_documents_uploaded_query(client_id, user_id)
```
- **Fires When**: User uploaded documents
- **Action**: Notify user verification has started
- **Use Case**: Progress tracking, engagement

### Rule 5: KYC Success (Verified User)
```python
kyc_completed_success_query(client_id, user_id)
```
- **Fires When**: User successfully completed KYC
- **Action**: Unlock premium features, send celebration email
- **Use Case**: Feature gating, premium access

### Rule 6: KYC Failed
```python
kyc_completed_failed_query(client_id, user_id)
```
- **Fires When**: User's KYC was rejected
- **Action**: Request resubmission, offer customer support
- **Use Case**: Compliance, user support

### Rule 7: KYC Cancelled
```python
kyc_cancelled_query(client_id, user_id)
```
- **Fires When**: User cancelled KYC
- **Action**: Send cancellation feedback form, offer support
- **Use Case**: Dropout tracking, user research

## SQL Queries

All rules use ClickHouse queries stored in `worker/rules.py`:

### Checking if User is KYC Verified
```sql
SELECT 1
FROM poc.events_raw e
WHERE e.client_id = 'client1'
  AND e.user_id = 'u2'
  AND e.canonical_event = 'kyc.completed'
  AND e.event_id IN (
      SELECT event_id
      FROM poc.event_props
      GROUP BY event_id
      HAVING lower(maxIf(value_string, key='status')) = 'success'
  )
LIMIT 1
```

This checks if user has at least one successful KYC completion.

## User Journey Examples

### Successful KYC Flow
```
u2: KYCInitiated
    ↓ [RULE 3 triggers] → Send welcome email
u2: KYCUploaded
    ↓ [RULE 4 triggers] → Send verification notification
u2: KYCCompleted (status=success)
    ↓ [RULE 5 triggers] → Send success email, unlock features
```

### Failed KYC Flow
```
u3: KYCInitiated
u3: KYCUploaded
u3: KYCCompleted (status=failed)
    ↓ [RULE 6 triggers] → Send retry prompt + support offer
```

### Cancelled Flow
```
u4: KYCInitiated
u4: KYCCancelled
    ↓ [RULE 7 triggers] → Send feedback form
```

## Testing KYC Events

Run the test client to send sample KYC events:

```bash
python client/send_events.py
```

This sends:
- 3 successful KYC flows (different stages)
- 1 failed KYC flow
- 1 cancelled flow
- Multiple client variations (client1, client2)

## Worker Output

When KYC events are processed, the worker logs rule triggers:

```
[RULE] User u2 initiated KYC => TRIGGER kyc_welcome_email
[RULE] User u2 uploaded KYC documents => TRIGGER kyc_verify_notification
[RULE] User u2 KYC verified (success) => TRIGGER kyc_success_celebration
[RULE] User u3 KYC rejected (failed) => TRIGGER kyc_failed_retry_prompt
[RULE] User u4 cancelled KYC => TRIGGER kyc_cancellation_feedback
```

## Integration with Existing Features

### Canonical Mapping
- KYC events are automatically canonicalized via `config/canonical_map.json`
- Supports multi-client event naming (client1 vs client2 terminology)
- Fallback to `custom.{event_name_lower}` for unmapped events

### Property Flattening
- KYC event properties are flattened to EAV format in `event_props` table
- Arrays like `document_types` are indexed: `document_types[0]`, `document_types[1]`
- Enables ad-hoc queries on KYC attributes

### Deduplication
- Duplicate KYC events are automatically skipped (idempotent processing)
- Prevents double-charging or repeated notifications
- Uses check-before-insert strategy

### Segmentation
- Can query KYC-verified users via `/segment/users` endpoint:
```bash
POST /segment/users
{
  "client_id": "client1",
  "predicates": [
    {
      "key": "canonical_event",
      "op": "eq",
      "value": "kyc.completed"
    }
  ]
}
```

## Schema

### events_raw Table
Stores complete KYC events:
```
client_id | user_id | event_id | event_name | canonical_event | props_json
```

### event_props Table
Queryable KYC properties:
```
client_id | user_id | key | value_string | value_number | value_bool
```

Example KYC properties in EAV format:
```
u2 | kyc_type | value_string | "basic"
u2 | status | value_string | "success"
u2 | verification_score | value_number | 95
u2 | verified_name | value_string | "John Doe"
u3 | status | value_string | "failed"
u3 | failure_reason | value_string | "document_quality_low"
```

## Next Steps

Potential enhancements:
1. **Advanced Rules**: Combine KYC with money events (e.g., "verified users with deposits")
2. **Webhooks**: Send real-time KYC status updates to external systems
3. **Monitoring**: Track KYC drop-off rates and failure reasons
4. **Analytics**: Cohort analysis by KYC status
5. **Custom Actions**: Add SMS, push notifications based on KYC status
