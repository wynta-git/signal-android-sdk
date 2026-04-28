import random
import time
import requests
from datetime import datetime, timezone

API = "http://localhost:8000/track"

def send(payload):
    r = requests.post(API, json=payload, timeout=10)
    print(r.status_code, r.json())

now = datetime.now(timezone.utc).isoformat()

# client1 deposit (INR)
send({
    "client_id": "client1",
    "user_id": "u1",
    "event_name": "Deposit",
    "event_time": now,
    "properties": {
        "amount": 1000,
        "currency": "INR",
        "status": "success",
        "channel": "upi"
    }
})

# client2 transfer (USD)
send({
    "client_id": "client2",
    "user_id": "u1",
    "event_name": "MoneyTransferred",
    "event_time": now,
    "properties": {
        "value": 10,
        "ccy": "USD",
        "state": "SUCCESS",
        "to_user": "u9"
    }
})

# client3 credited (amt_cents)
send({
    "client_id": "client3",
    "user_id": "u77",
    "event_name": "credited",
    "event_time": now,
    "properties": {
        "amt_cents": 2500,
        "currency": "INR",
        "result": 1
    }
})

# random custom events to show generic handling
for i in range(3):
    send({
        "client_id": "client1",
        "user_id": "u1",
        "event_name": random.choice(["PageView", "ButtonClick", "Login"]),
        "event_time": datetime.now(timezone.utc).isoformat(),
        "properties": {
            "path": "/home",
            "ab_variant": random.choice(["A", "B"]),
            "latency_ms": random.randint(10, 200)
        }
    })
    time.sleep(0.2)

# ============================================================================
# KYC Events Examples
# ============================================================================

# client1 - KYC Initiated
send({
    "client_id": "client1",
    "user_id": "u2",
    "event_name": "KYCInitiated",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "kyc_type": "basic",
        "initiated_via": "mobile_app",
        "country": "IN"
    }
})
time.sleep(0.2)

# client1 - KYC Documents Uploaded
send({
    "client_id": "client1",
    "user_id": "u2",
    "event_name": "KYCUploaded",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "document_types": ["aadhar", "selfie"],
        "upload_count": 2,
        "file_sizes_kb": [512, 256]
    }
})
time.sleep(0.2)

# client1 - KYC Completed (Success)
send({
    "client_id": "client1",
    "user_id": "u2",
    "event_name": "KYCCompleted",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "status": "success",
        "verification_score": 95,
        "verified_name": "John Doe",
        "verified_dob": "1990-01-15"
    }
})
time.sleep(0.2)

# client1 - KYC Initiated (another user)
send({
    "client_id": "client1",
    "user_id": "u3",
    "event_name": "KYCInitiated",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "kyc_type": "enhanced",
        "initiated_via": "web",
        "country": "IN"
    }
})
time.sleep(0.2)

# client1 - KYC Uploaded (u3)
send({
    "client_id": "client1",
    "user_id": "u3",
    "event_name": "KYCUploaded",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "document_types": ["passport"],
        "upload_count": 1,
        "file_sizes_kb": [768]
    }
})
time.sleep(0.2)

# client1 - KYC Completed (Failed)
send({
    "client_id": "client1",
    "user_id": "u3",
    "event_name": "KYCCompleted",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "status": "failed",
        "failure_reason": "document_quality_low",
        "verification_score": 45
    }
})
time.sleep(0.2)

# client1 - KYC Cancelled
send({
    "client_id": "client1",
    "user_id": "u4",
    "event_name": "KYCInitiated",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "kyc_type": "basic",
        "initiated_via": "mobile_app",
        "country": "IN"
    }
})
time.sleep(0.2)

send({
    "client_id": "client1",
    "user_id": "u4",
    "event_name": "KYCCancelled",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "cancellation_reason": "user_initiated",
        "time_in_flow_seconds": 120
    }
})
time.sleep(0.2)

# client2 - Verification workflow (client2 uses different names)
send({
    "client_id": "client2",
    "user_id": "u5",
    "event_name": "VerificationStarted",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "verification_level": "tier1",
        "platform": "web"
    }
})
time.sleep(0.2)

send({
    "client_id": "client2",
    "user_id": "u5",
    "event_name": "DocumentsUploaded",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "doc_count": 3,
        "total_size_mb": 2.5
    }
})
time.sleep(0.2)

send({
    "client_id": "client2",
    "user_id": "u5",
    "event_name": "VerificationComplete",
    "event_time": datetime.now(timezone.utc).isoformat(),
    "properties": {
        "status": "success",
        "confidence_score": 98,
        "processing_time_minutes": 45
    }
})
time.sleep(0.2)