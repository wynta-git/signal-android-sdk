
**Event Tracking Service**

API Integration Guide
Service:  PAM API Service    Version:  0.1.0

## Overview

The Event Tracking Service provides two core endpoints for capturing player behaviour and maintaining player profile data in real time. Events are accepted asynchronously — the API validates and queues each payload, returning immediately with an accepted/rejected count rather than waiting for downstream processing to complete.


**Base URL**

http://<host>:8001


**Authentication**

All endpoints require a Bearer token passed in the Authorization header. Tokens are scoped per environment (live / staging) and are issued via the Admin API.
Authorization: Bearer <your_token>


### Request Headers

The following headers apply to all API endpoints.

| Header | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| Authorization | String | Yes | N/A | Bearer <token> — a secret token issued per client. All endpoints require this. |
| Content-Type | String | Yes | N/A | Must be application/json for all POST request bodies. |
| X-Client-Id | String | No | — | SDK or client identifier. Bound to structured logs for traceability. |
| X-Idempotency-Key | String | No | — | UUID v4 — enables deduplication and caching. Recommended for retry logic. |


### Authentication Error Responses

The following errors are returned when authentication or authorisation fails.

| Status | Code | Message | Trigger |
| --- | --- | --- | --- |
| 401 | invalid_token | Missing or malformed Authorization header | No Authorization header present, or not using Bearer scheme. |
| 401 | invalid_token | Invalid or expired token | Token not found in DB, has been revoked, or has expired. |
| 403 | forbidden | Token scope insufficient | Token exists but lacks the required scope (e.g. events:write). |


## Endpoints at a Glance


| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | /v1/events/track | Track one or more behavioural events for a player (e.g. login, deposit, bet placed). |
| POST | /v1/events/identify | Create or update a player profile with traits (e.g. country, VIP level, account status). |

|  |
| --- |


## 1.  Track Events


**POST   /v1/events/track**


Accepts a batch of one or more event objects and routes them to the configured downstream destinations (e.g. CRM, data warehouse, message broker). The API validates each event individually — valid events are accepted and invalid ones are rejected with per-event error details. The response is returned with HTTP 202 Accepted, indicating the events have been queued for processing.

**Request Body**


| Field | Type | Required | Description |
| --- | --- | --- | --- |
| events | array | Yes | Array of event objects. Each object must conform to the event schema described below. Minimum one event per request. |


### Event Object Schema

Each item in the events array represents a single player action. The fields below are the standard envelope — additional properties can be passed inside properties for event-specific data.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| user_id | string | Yes | Unique identifier for the player in your system. Must be consistent across all events for the same player. |
| session_id | string | No | Identifier for the current player session. Used to group events within a single session. |
| event_id | string | No | Unique identifier for this specific event instance. Used for deduplication. Recommended format: UUID v4. |
| event_name | string | Yes | Name of the event being tracked (e.g. login_success, deposit_completed, bet_placed). Use snake_case. |
| timestamp | string | Yes | ISO 8601 datetime string representing when the event occurred. Example: 2026-05-18T14:38:00.000Z |
| device_type | string | No | Type of device used. Accepted values: mobile, tablet, desktop. |
| platform | string | No | Operating system or platform. Accepted values: ios, android, web. |
| brand_id | string | No | Identifier for the brand or operator, used in multi-brand setups. |
| properties | object | No | Free-form key-value object containing event-specific data. All values must be JSON-serialisable. |


**Example Request**

POST /v1/events/track
Authorization: Bearer <token>
Content-Type: application/json

{
"events": [
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0007",
"event_name": "deposit_success",
"timestamp": "2026-05-18T15:10:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "brand_01",
"properties": {
"amount": 100,
"currency": "EUR",
"payment_method": "visa"
}
},
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0008",
"event_name": "bet_placed",
"timestamp": "2026-05-18T15:16:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "brand_01",
"properties": {
"bet_amount": 2,
"currency": "EUR",
"game_id": "gates_of_olympus"
}
}
]
}


**Response  —  202 Accepted**


| Field | Type | Description |
| --- | --- | --- |
| accepted | integer | Number of events that passed validation and were successfully queued for processing. |
| rejected | integer | Number of events that failed validation and were not queued. |
| errors | array | Array of EventError objects describing each rejected event. Empty if all events were accepted. |


### EventError Object


| Field | Type | Description |
| --- | --- | --- |
| index | integer | Zero-based position of the failed event in the submitted events array. |
| event_id | string | null | The event_id of the failed event, if one was provided in the request. |
| code | string | Machine-readable error code identifying the failure reason (e.g. MISSING_FIELD, INVALID_TYPE). |
| message | string | Human-readable description of the validation failure. |


**Example Response — full success**

{
"accepted": 2,
"rejected": 0,
"errors": []
}


**Example Response — partial failure**

{
"accepted": 1,
"rejected": 1,
"errors": [
{
"index": 1,
"event_id": "a1b2c3d4-0000-0000-0000-0008",
"code": "MISSING_FIELD",
"message": "event_name is required"
}
]
}


**HTTP Status Codes**


| Status | Meaning | Description |
| --- | --- | --- |
| 202 | Accepted | The request was received and processed. Check accepted/rejected counts in the response body — a 202 does not guarantee all events were accepted. |
| 401 | Unauthorized | Missing or invalid Bearer token. |
| 422 | Validation Error | The request body itself is malformed (e.g. events field is not an array). Distinct from per-event validation errors returned in the 202 body. |

|  |
| --- |


## 2.  Identify Player


**POST   /v1/events/identify**


Creates or updates the profile (traits) for a known player. Use this endpoint whenever player attributes change — such as on registration, KYC approval, VIP tier change, or preference update. Traits are merged into the player's profile by default; use unset_traits to explicitly remove fields. The response is returned with HTTP 202 Accepted.

**Request Body**


| Field | Type | Required | Description |
| --- | --- | --- | --- |
| user_id | string | Yes | Unique identifier for the player. Must match the user_id used in track events for the same player. |
| anonymous_id | string | No | Anonymous identifier for the player prior to login or registration. Used to link pre-login behaviour to an identified profile. |
| traits | object | No | Key-value object of player attributes to set or update. All values must be JSON-serialisable. Existing traits not included here are left unchanged. |
| unset_traits | array | No | List of trait field names to explicitly remove from the player profile. Applied after traits are merged. |
| timestamp | string | Yes | ISO 8601 datetime string for when this identify call occurred. Example: 2026-05-18T14:38:00.000Z |


### Common Trait Fields

While traits is a free-form object, the following fields are commonly used across iGaming platforms:

| Trait | Type | Description |
| --- | --- | --- |
| email | string | Player's email address. |
| phone | string | Player's phone number in E.164 format. |
| first_name | string | Player's first name. |
| last_name | string | Player's last name. |
| date_of_birth | string | Date of birth in YYYY-MM-DD format. |
| country | string | ISO 3166-1 alpha-2 country code (e.g. MT, GB, DE). |
| currency | string | Player's primary currency code (e.g. EUR, GBP). |
| language | string | Preferred language code (e.g. en, de, fr). |
| kyc_status | string | KYC verification status. E.g. pending, approved, rejected. |
| vip_level | string | Current VIP tier (e.g. bronze, silver, gold, platinum). |
| account_status | string | Account state. E.g. active, suspended, self_excluded, closed. |
| registration_date | string | ISO 8601 datetime when the player registered. |
| brand_id | string | Brand or operator identifier in multi-brand setups. |


**Example Request — new registration**

POST /v1/events/identify
Authorization: Bearer <token>
Content-Type: application/json

{
"user_id": "ply_776192",
"timestamp": "2026-05-18T14:38:00.000Z",
"traits": {
"email": "player@example.com",
"first_name": "Alex",
"last_name": "Smith",
"date_of_birth": "1990-04-15",
"country": "MT",
"currency": "EUR",
"language": "en",
"kyc_status": "pending",
"vip_level": "bronze",
"account_status": "active",
"registration_date": "2026-05-18T14:38:00.000Z",
"brand_id": "brand_01"
}
}


**Example Request — VIP upgrade + unset a trait**

{
"user_id": "ply_776192",
"timestamp": "2026-05-18T20:00:00.000Z",
"traits": {
"vip_level": "platinum",
"kyc_status": "approved"
},
"unset_traits": ["anonymous_segment"]
}


**Response  —  202 Accepted**


| Field | Type | Description |
| --- | --- | --- |
| user_id | string | The user_id of the player whose profile was created or updated. Echoed back from the request for confirmation. |


**Example Response**

{
"user_id": "ply_776192"
}


**HTTP Status Codes**


| Status | Meaning | Description |
| --- | --- | --- |
| 202 | Accepted | Profile update queued successfully. |
| 401 | Unauthorized | Missing or invalid Bearer token. |
| 422 | Validation Error | The request body is malformed — typically a missing required field (user_id or timestamp) or incorrect data type. |

|  |
| --- |


## Error Reference


**All 422 Validation Error responses share this structure:**

{
"detail": [
{
"loc": ["body", "user_id"],
"msg": "field required",
"type": "missing",
"input": null,
"ctx": {}
}
]
}

| Field | Type | Description |
| --- | --- | --- |
| detail | array | List of one or more validation error objects. |
| loc | array | Path to the field that failed validation (e.g. ["body", "user_id"]). |
| msg | string | Human-readable error message. |
| type | string | Machine-readable error type code (e.g. missing, string_type, value_error). |
| input | any | The value that was actually received for the failing field. |
| ctx | object | Additional context about the error, such as expected constraints. |

|  |
| --- |


## Integration Notes



**Batching Events**

The /v1/events/track endpoint accepts multiple events in a single request. Batch events where possible to reduce HTTP overhead — especially for high-frequency events such as slot spins or heartbeats. A sensible batch size is 10–50 events per request.

**Event Ordering**

Events within a batch are processed in order. Always include a precise timestamp on each event — do not rely on server-side receipt time for ordering, as batches may arrive out of sequence during retries.

**Deduplication**

Providing a unique event_id on each event enables the service to deduplicate retried requests. Without an event_id, duplicate events may be processed if the same request is sent more than once.

**Identify Before Track**

Call /v1/events/identify at registration and whenever key player traits change. This ensures the CRM and downstream systems always have an up-to-date player profile when events arrive.

| ⚠ Note:  The /v1/events/track response of 202 Accepted does not guarantee downstream delivery. Monitor the rejected count and errors array in every response and implement retry logic for failed events. |
| --- |

|  |
| --- |


## Code Examples



### POST /v1/events/track  —  Track Events



**cURL**

```
curl -X POST "http://<host>:8001/v1/events/track" \
-H "Authorization: Bearer <your_token>" \
-H "Content-Type: application/json" \
-d '{
"events": [
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0007",
"event_name": "deposit_success",
"timestamp": "2026-05-18T15:10:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "brand_01",
"properties": {
"amount": 100,
"currency": "EUR",
"payment_method": "visa"
}
}
]
}'
```


**JavaScript (fetch)**

```
const response = await fetch("http://<host>:8001/v1/events/track", {
method: "POST",
headers: {
"Authorization": "Bearer <your_token>",
"Content-Type": "application/json",
},
body: JSON.stringify({
events: [
{
user_id: "ply_776192",
session_id: "sess_abc12398",
event_id: "a1b2c3d4-0000-0000-0000-0007",
event_name: "deposit_success",
timestamp: new Date().toISOString(),
device_type: "mobile",
platform: "android",
brand_id: "brand_01",
properties: {
amount: 100,
currency: "EUR",
payment_method: "visa",
},
},
],
}),
});

const data = await response.json();
console.log(`Accepted: ${data.accepted}, Rejected: ${data.rejected}`);

if (data.errors.length > 0) {
data.errors.forEach(err => {
console.error(`Event[${err.index}] failed: ${err.code} - ${err.message}`);
});
}
```


**Python (requests)**

```
import requests

url = "http://<host>:8001/v1/events/track"
headers = {
"Authorization": "Bearer <your_token>",
"Content-Type": "application/json",
}
payload = {
"events": [
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0007",
"event_name": "deposit_success",
"timestamp": "2026-05-18T15:10:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "brand_01",
"properties": {
"amount": 100,
"currency": "EUR",
"payment_method": "visa",
},
}
]
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

print(f"Accepted: {data['accepted']}, Rejected: {data['rejected']}")
for err in data.get("errors", []):
print(f"Event[{err['index']}] failed: {err['code']} - {err['message']}")
```


**Node.js (axios)**

```
const axios = require("axios");   // npm install axios

const client = axios.create({
baseURL: "http://<host>:8001",
headers: { Authorization: "Bearer <your_token>" },
});

async function trackEvents(events) {
const { data } = await client.post("/v1/events/track", { events });
console.log(`Accepted: ${data.accepted}, Rejected: ${data.rejected}`);
if (data.errors.length > 0) {
data.errors.forEach(err =>
console.error(`Event[${err.index}] failed: ${err.code} - ${err.message}`))
}
return data;
}

trackEvents([
{
user_id: "ply_776192",
session_id: "sess_abc12398",
event_id: "a1b2c3d4-0000-0000-0000-0007",
event_name: "deposit_success",
timestamp: new Date().toISOString(),
device_type: "mobile",
platform: "android",
brand_id: "brand_01",
properties: { amount: 100, currency: "EUR", payment_method: "visa" },
},
]);
```

|  |
| --- |

|  |
| --- |


### POST /v1/events/identify  —  Identify Player



**cURL**

```
curl -X POST "http://<host>:8001/v1/events/identify" \
-H "Authorization: Bearer <your_token>" \
-H "Content-Type: application/json" \
-d '{
"user_id": "ply_776192",
"timestamp": "2026-05-18T14:38:00.000Z",
"traits": {
"email": "player@example.com",
"first_name": "Alex",
"last_name": "Smith",
"country": "MT",
"currency": "EUR",
"kyc_status": "approved",
"vip_level": "gold",
"account_status": "active"
}
}'
```


**JavaScript (fetch)**

```
const response = await fetch("http://<host>:8001/v1/events/identify", {
method: "POST",
headers: {
"Authorization": "Bearer <your_token>",
"Content-Type": "application/json",
},
body: JSON.stringify({
user_id: "ply_776192",
timestamp: new Date().toISOString(),
traits: {
email: "player@example.com",
first_name: "Alex",
last_name: "Smith",
country: "MT",
currency: "EUR",
kyc_status: "approved",
vip_level: "gold",
account_status: "active",
},
}),
});

const data = await response.json();
console.log("Profile updated for:", data.user_id);
```


**Python (requests)**

```
import requests

url = "http://<host>:8001/v1/events/identify"
headers = {
"Authorization": "Bearer <your_token>",
"Content-Type": "application/json",
}
payload = {
"user_id": "ply_776192",
"timestamp": "2026-05-18T14:38:00.000Z",
"traits": {
"email": "player@example.com",
"first_name": "Alex",
"last_name": "Smith",
"country": "MT",
"currency": "EUR",
"kyc_status": "approved",
"vip_level": "gold",
"account_status": "active",
},
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()
print(f"Profile updated for: {data['user_id']}")
```


**Node.js (axios)**

```
const axios = require("axios");   // npm install axios

const client = axios.create({
baseURL: "http://<host>:8001",
headers: { Authorization: "Bearer <your_token>" },
});

async function identifyPlayer(userId, traits) {
const { data } = await client.post("/v1/events/identify", {
user_id: userId,
timestamp: new Date().toISOString(),
traits,
});
console.log("Profile updated for:", data.user_id);
return data;
}

identifyPlayer("ply_776192", {
email: "player@example.com",
first_name: "Alex",
last_name: "Smith",
country: "MT",
currency: "EUR",
kyc_status: "approved",
vip_level: "gold",
account_status: "active",
});
```


# Complete iGaming CRM Event Taxonomy


## Registration & Authentication


### Event List

registration_started
registration_completed
registration_failed
guest_account_created
social_signup_started
social_signup_completed
email_verification_sent
email_verified
phone_verification_sent
phone_verified
kyc_started
kyc_submitted
kyc_approved
kyc_rejected
kyc_resubmitted
age_verification_completed
identity_verification_completed
address_verification_completed
duplicate_account_detected
login_started
login_success
login_failed
logout
password_reset_requested
password_reset_completed
two_factor_enabled
two_factor_disabled
account_locked
account_unlocked

### Sample Event Property Structures


#### registration_completed


| Property | Sample Value |
| --- | --- |
| registration_method | email |
| promo_code | WELCOME100 |
| currency | EUR |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0001",
"event_name": "registration_completed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"registration_method": "email",
"promo_code": "WELCOME100",
"currency": "EUR"
}
}
```


#### kyc_submitted


| Property | Sample Value |
| --- | --- |
| document_type | passport |
| verification_vendor | sumsub |
| attempt_number | 1 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0002",
"event_name": "kyc_submitted",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"document_type": "passport",
"verification_vendor": "sumsub",
"attempt_number": 1
}
}
```


#### email_verified


| Property | Sample Value |
| --- | --- |
| verification_method | "link" |
| email | "user@example.com" |
| verified_at | "2026-05-18T14:40:00.000Z" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0021",
"event_name": "email_verified",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"verification_method": "link",
"email": "user@example.com",
"verified_at": "2026-05-18T14:40:00.000Z"
}
}
```


#### phone_verified


| Property | Sample Value |
| --- | --- |
| phone_number | "+35699123456" |
| verification_method | "sms_otp" |
| verified_at | "2026-05-18T14:41:00.000Z" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0022",
"event_name": "phone_verified",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"phone_number": "+35699123456",
"verification_method": "sms_otp",
"verified_at": "2026-05-18T14:41:00.000Z"
}
}
```


#### login_failed


| Property | Sample Value |
| --- | --- |
| login_method | "email_password" |
| failure_reason | "invalid_password" |
| attempt_number | 2 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0023",
"event_name": "login_failed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"login_method": "email_password",
"failure_reason": "invalid_password",
"attempt_number": 2
}
}
```


#### login_success


| Property | Sample Value |
| --- | --- |
| login_method | email_password |
| two_factor_used | true |
| device_id | dev_00122 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0003",
"event_name": "login_success",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"login_method": "email_password",
"two_factor_used": true,
"device_id": "dev_00122"
}
}
```


## Session & Engagement


### Event List

app_opened
app_closed
session_started
session_ended
heartbeat
page_viewed
lobby_viewed
game_category_viewed
search_performed
game_details_viewed
provider_viewed
banner_clicked
promotion_viewed
notification_opened
push_received
notification_clicked
email_opened
email_clicked
sms_clicked
deeplink_opened

### Sample Event Property Structures


#### session_started


| Property | Sample Value |
| --- | --- |
| app_version | 3.4.1 |
| network_type | wifi |
| device_model | Samsung S24 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0041",
"event_name": "notification_clicked",
"timestamp": "2026-05-18T15:22:05.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "brand_01",
"properties": {
"campaign_id": "camp_100",
"campaign_name": "Weekend Deposit Boost",
"notification_type": "promotional",
"channel": "push",
"template_id": "tmpl_push_01",
"action_id": "cta_deposit_now",
"deep_link": "/casino/deposit"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0006",
"event_name": "promotion_viewed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"promotion_id": "promo_100",
"promotion_type": "deposit_bonus",
"placement": "homepage_banner"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0005",
"event_name": "game_category_viewed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"category_name": "slots",
"subcategory_name": "megaways",
"sort_order": "popular"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0004",
"event_name": "session_started",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"app_version": "3.4.1",
"network_type": "wifi",
"device_model": "Samsung S24"
}
}
```


#### game_category_viewed


| Property | Sample Value |
| --- | --- |
| category_name | slots |
| subcategory_name | megaways |
| sort_order | popular |


#### promotion_viewed


| Property | Sample Value |
| --- | --- |
| promotion_id | promo_100 |
| promotion_type | deposit_bonus |
| placement | homepage_banner |


## Financial


### Event List

deposit_started
deposit_submitted
deposit_success
deposit_failed
deposit_pending
deposit_cancelled
first_deposit_completed
repeat_deposit_completed
deposit_method_added
deposit_method_removed
payment_method_selected
saved_card_added
withdrawal_started
withdrawal_requested
withdrawal_approved
withdrawal_rejected
withdrawal_processed
withdrawal_completed
withdrawal_failed
withdrawal_cancelled
wallet_balance_updated
wallet_bonus_balance_updated
wallet_locked
wallet_unlocked
manual_adjustment_credit
manual_adjustment_debit
cashback_credited
cashback_claimed
refund_processed

### Sample Event Property Structures


#### deposit_submitted


| Property | Sample Value |
| --- | --- |
| amount | 100 |
| currency | "EUR" |
| payment_method | "visa" |
| transaction_id | "txn_882001" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0024",
"event_name": "deposit_submitted",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"amount": 100,
"currency": "EUR",
"payment_method": "visa",
"transaction_id": "txn_882001"
}
}
```


#### deposit_success


| Property | Sample Value |
| --- | --- |
| amount | 100 |
| currency | EUR |
| payment_method | visa |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0009",
"event_name": "cashback_credited",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"amount": 15,
"currency": "EUR",
"cashback_type": "weekly_lossback"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0008",
"event_name": "withdrawal_requested",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"amount": 250,
"currency": "EUR",
"withdrawal_method": "bank_transfer"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0007",
"event_name": "deposit_success",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"amount": 100,
"currency": "EUR",
"payment_method": "visa"
}
}
```


#### withdrawal_requested


| Property | Sample Value |
| --- | --- |
| amount | 250 |
| currency | EUR |
| withdrawal_method | bank_transfer |


#### withdrawal_processed


| Property | Sample Value |
| --- | --- |
| amount | 250 |
| currency | "EUR" |
| withdrawal_method | "bank_transfer" |
| transaction_id | "txn_993210" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0025",
"event_name": "withdrawal_processed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"amount": 250,
"currency": "EUR",
"withdrawal_method": "bank_transfer",
"transaction_id": "txn_993210"
}
}
```


#### wallet_balance_updated


| Property | Sample Value |
| --- | --- |
| previous_balance | 320.50 |
| new_balance | 420.50 |
| currency | "EUR" |
| update_reason | "deposit" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0026",
"event_name": "wallet_balance_updated",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"previous_balance": 320.50,
"new_balance": 420.50,
"currency": "EUR",
"update_reason": "deposit"
}
}
```


#### refund_processed


| Property | Sample Value |
| --- | --- |
| amount | 50 |
| currency | "EUR" |
| refund_reason | "failed_withdrawal" |
| original_transaction_id | "txn_993199" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0027",
"event_name": "refund_processed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"amount": 50,
"currency": "EUR",
"refund_reason": "failed_withdrawal",
"original_transaction_id": "txn_993199"
}
}
```


#### cashback_credited


| Property | Sample Value |
| --- | --- |
| amount | 15 |
| currency | EUR |
| cashback_type | weekly_lossback |


## Bonus & Promotions


### Event List

bonus_viewed
bonus_opted_in
bonus_activated
bonus_awarded
bonus_claimed
bonus_expired
bonus_cancelled
bonus_forfeited
bonus_wagering_started
bonus_wagering_completed
bonus_converted_to_cash
free_spin_awarded
free_spin_used
free_spin_expired
promo_code_entered
promo_code_applied
promo_code_failed
tournament_joined
leaderboard_entered
leaderboard_reward_claimed
mission_started
mission_completed
loyalty_points_earned
loyalty_points_redeemed
vip_level_upgraded

### Sample Event Property Structures


#### bonus_claimed


| Property | Sample Value |
| --- | --- |
| bonus_id | bonus_100 |
| bonus_amount | 100 |
| currency | EUR |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0012",
"event_name": "vip_level_upgraded",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"previous_vip_level": "gold",
"new_vip_level": "platinum",
"vip_points": 25000
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0011",
"event_name": "free_spin_used",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "sweet_bonanza",
"provider_id": "pragmatic_play",
"spin_value": 0.2
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0010",
"event_name": "bonus_claimed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"bonus_id": "bonus_100",
"bonus_amount": 100,
"currency": "EUR"
}
}
```


#### free_spin_used


| Property | Sample Value |
| --- | --- |
| game_id | sweet_bonanza |
| provider_id | pragmatic_play |
| spin_value | 0.2 |


#### vip_level_upgraded


| Property | Sample Value |
| --- | --- |
| previous_vip_level | gold |
| new_vip_level | platinum |
| vip_points | 25000 |


## Gameplay


### Event List

game_opened
game_loaded
game_load_failed
game_started
game_paused
game_resumed
game_closed
game_crashed
bet_placed
bet_confirmed
bet_failed
bet_cancelled
bet_settled
bet_won
bet_lost
bet_voided
bet_cashout_requested
bet_cashout_completed
max_bet_limit_hit
insufficient_balance_detected
slot_spin_started
slot_spin_completed
slot_feature_triggered
slot_bonus_round_started
slot_bonus_round_completed
slot_jackpot_triggered
slot_jackpot_won
slot_autospin_enabled
slot_autospin_disabled
live_table_joined
live_table_left
dealer_interaction
side_bet_placed
seat_reserved
poker_table_joined
poker_table_left
poker_hand_started
poker_hand_completed
poker_tournament_registered
poker_tournament_started
poker_tournament_finished
poker_rebuy_completed
poker_addon_purchased

### Sample Event Property Structures


#### game_opened


| Property | Sample Value |
| --- | --- |
| game_id | gates_of_olympus |
| provider_id | pragmatic_play |
| game_type | slot |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0015",
"event_name": "bet_won",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"win_amount": 18,
"multiplier": 9,
"currency": "EUR"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0014",
"event_name": "bet_placed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"bet_amount": 2,
"currency": "EUR",
"wallet_type": "cash"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0013",
"event_name": "game_opened",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "gates_of_olympus",
"provider_id": "pragmatic_play",
"game_type": "slot"
}
}
```


#### game_started


| Property | Sample Value |
| --- | --- |
| game_id | "gates_of_olympus" |
| provider_id | "pragmatic_play" |
| game_type | "slot" |
| balance_at_start | 320.50 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0028",
"event_name": "game_started",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "gates_of_olympus",
"provider_id": "pragmatic_play",
"game_type": "slot",
"balance_at_start": 320.50
}
}
```


#### game_ended


| Property | Sample Value |
| --- | --- |
| game_id | "gates_of_olympus" |
| provider_id | "pragmatic_play" |
| session_duration_seconds | 342 |
| balance_at_end | 285.00 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0029",
"event_name": "game_ended",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "gates_of_olympus",
"provider_id": "pragmatic_play",
"session_duration_seconds": 342,
"balance_at_end": 285.00
}
}
```


#### game_crashed


| Property | Sample Value |
| --- | --- |
| game_id | "gates_of_olympus" |
| provider_id | "pragmatic_play" |
| error_code | "ERR_NETWORK_TIMEOUT" |
| active_bet_amount | 2.00 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0030",
"event_name": "game_crashed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "gates_of_olympus",
"provider_id": "pragmatic_play",
"error_code": "ERR_NETWORK_TIMEOUT",
"active_bet_amount": 2.00
}
}
```


#### bet_placed


| Property | Sample Value |
| --- | --- |
| bet_amount | 2 |
| currency | EUR |
| wallet_type | cash |


#### bet_won


| Property | Sample Value |
| --- | --- |
| win_amount | 18 |
| multiplier | 9 |
| currency | EUR |


#### bet_lost


| Property | Sample Value |
| --- | --- |
| bet_amount | 2 |
| currency | "EUR" |
| wallet_type | "cash" |
| game_id | "gates_of_olympus" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0031",
"event_name": "bet_lost",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"bet_amount": 2,
"currency": "EUR",
"wallet_type": "cash",
"game_id": "gates_of_olympus"
}
}
```


#### slot_spin_started


| Property | Sample Value |
| --- | --- |
| game_id | "sweet_bonanza" |
| provider_id | "pragmatic_play" |
| bet_amount | 1.00 |
| currency | "EUR" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0032",
"event_name": "slot_spin_started",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "sweet_bonanza",
"provider_id": "pragmatic_play",
"bet_amount": 1.00,
"currency": "EUR"
}
}
```


#### slot_spin_completed


| Property | Sample Value |
| --- | --- |
| game_id | "sweet_bonanza" |
| provider_id | "pragmatic_play" |
| win_amount | 4.50 |
| currency | "EUR" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0033",
"event_name": "slot_spin_completed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "sweet_bonanza",
"provider_id": "pragmatic_play",
"win_amount": 4.50,
"currency": "EUR"
}
}
```


#### live_table_joined


| Property | Sample Value |
| --- | --- |
| game_id | "live_roulette_vip" |
| provider_id | "evolution" |
| table_id | "tbl_rlt_007" |
| game_type | "live_roulette" |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0034",
"event_name": "live_table_joined",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "live_roulette_vip",
"provider_id": "evolution",
"table_id": "tbl_rlt_007",
"game_type": "live_roulette"
}
}
```


#### live_table_left


| Property | Sample Value |
| --- | --- |
| game_id | "live_roulette_vip" |
| provider_id | "evolution" |
| table_id | "tbl_rlt_007" |
| session_duration_seconds | 610 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0035",
"event_name": "live_table_left",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"game_id": "live_roulette_vip",
"provider_id": "evolution",
"table_id": "tbl_rlt_007",
"session_duration_seconds": 610
}
}
```


## Sportsbook


### Event List

sportsbook_opened
sport_selected
league_selected
match_viewed
odds_viewed
bet_builder_used
single_bet_placed
multi_bet_placed
live_bet_placed
cashout_viewed
cashout_accepted
cashout_rejected
bet_slip_opened
bet_slip_abandoned
favorite_team_added

### Sample Event Property Structures


#### single_bet_placed


| Property | Sample Value |
| --- | --- |
| sport | football |
| league | EPL |
| stake_amount | 20 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0017",
"event_name": "cashout_accepted",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"cashout_amount": 32,
"profit_amount": 12,
"currency": "EUR"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0016",
"event_name": "single_bet_placed",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"sport": "football",
"league": "EPL",
"stake_amount": 20
}
}
```


#### cashout_accepted


| Property | Sample Value |
| --- | --- |
| cashout_amount | 32 |
| profit_amount | 12 |
| currency | EUR |


## CRM & Engagement


### Event List

campaign_entered
campaign_exited
journey_entered
journey_completed
journey_dropped
segment_entered
segment_exited
webhook_received
recommendation_clicked
survey_started
survey_completed
feedback_submitted
support_chat_started
support_ticket_created
affiliate_click_tracked
affiliate_registration_tracked

### Sample Event Property Structures


#### campaign_entered


| Property | Sample Value |
| --- | --- |
| campaign_id | camp_100 |
| campaign_name | Deposit Reactivation |
| channel | push |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0020",
"event_name": "segment_entered",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"segment_id": "seg_vip",
"segment_name": "High Value Players",
"entry_reason": "deposit_threshold"
}
}
```


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0018",
"event_name": "campaign_entered",
"timestamp": "2026-05-18T14:38:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "utm_camp_12",
"properties": {
"campaign_id": "camp_100",
"campaign_name": "Deposit Reactivation",
"channel": "push"
}
}
```


#### notification_clicked


| Property | Sample Value |
| --- | --- |
| campaign_id | camp_100 |
| campaign_name | Weekend Deposit Boost |
| notification_type | promotional |
| channel | push |
| template_id | tmpl_push_01 |
| action_id | cta_deposit_now |
| deep_link | /casino/deposit |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0041",
"event_name": "notification_clicked",
"timestamp": "2026-05-18T15:22:05.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "brand_01",
"properties": {
"campaign_id": "camp_100",
"campaign_name": "Weekend Deposit Boost",
"notification_type": "promotional",
"channel": "push",
"template_id": "tmpl_push_01",
"action_id": "cta_deposit_now",
"deep_link": "/casino/deposit"
}
}
```


#### notification_opened


| Property | Sample Value |
| --- | --- |
| campaign_id | camp_100 |
| campaign_name | Weekend Deposit Boost |
| notification_type | promotional |
| channel | push |
| template_id | tmpl_push_01 |


**Sample JSON**

```
{
"user_id": "ply_776192",
"session_id": "sess_abc12398",
"event_id": "a1b2c3d4-0000-0000-0000-0040",
"event_name": "notification_opened",
"timestamp": "2026-05-18T15:22:00.000Z",
"device_type": "mobile",
"platform": "android",
"brand_id": "brand_01",
"properties": {
"campaign_id": "camp_100",
"campaign_name": "Weekend Deposit Boost",
"notification_type": "promotional",
"channel": "push",
"template_id": "tmpl_push_01"
}
}
```


#### segment_entered


| Property | Sample Value |
| --- | --- |
| segment_id | seg_vip |
| segment_name | High Value Players |
| entry_reason | deposit_threshold |
