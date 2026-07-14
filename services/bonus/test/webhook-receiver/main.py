"""Bonus webhook test receiver.

Simulates the external PAM system's inbound webhook endpoint described in
services/bonus/wallet-update.md — accepts BONUS_GRANTED / BONUS_RELEASED /
BONUS_EXPIRED / BONUS_FORFEITED (and anything else) posted by the bonus
service's webhook sender, verifies auth (Bearer or the proposed
HMAC-SHA256 scheme), and prints + logs every event received.

Point a site's webhook_config `url` at this receiver, e.g.:
    http://localhost:8999/api/v1/webhook/wallet-update

Run:
    ./start.sh
or directly:
    uv run uvicorn main:app --reload --port 8999
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse

from shared.logging_config import configure_logging

# Same rotating-JSON-file + stdout convention as bonus-service/auth-service —
# writes to {project_root}/logs/webhook-receiver.log. Requires PYTHONPATH to
# include the repo root (see start.sh / the systemd unit's Environment=).
configure_logging(
    log_dir=os.environ.get("LOG_DIR") or None,
    log_level=os.environ.get("LOG_LEVEL", "INFO"),
    service_name="webhook-receiver",
)
log = structlog.get_logger(__name__)

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "wirefrog-v1")
WEBHOOK_BEARER_TOKEN = os.environ.get("WEBHOOK_BEARER_TOKEN", "abc@123456")
REPLAY_WINDOW_SECONDS = 300

app = FastAPI(title="Bonus Webhook Test Receiver")
router = APIRouter()

received_events: list[dict] = []
_MAX_KEPT_EVENTS = 200


def _verify_hmac(client_id: str, timestamp: str, signature: str, raw_body: bytes) -> tuple[bool, str]:
    if not WEBHOOK_SECRET:
        return False, "WEBHOOK_SECRET not configured on receiver"
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False, "invalid or missing X-Timestamp"
    if abs(time.time() - ts) > REPLAY_WINDOW_SECONDS:
        return False, f"timestamp outside {REPLAY_WINDOW_SECONDS}s replay window"

    # Canonical string per wallet-update.md: client_id + "\n" + timestamp + "\n" + raw_body
    canonical = f"{client_id}\n{timestamp}\n".encode() + raw_body
    expected = hmac.new(WEBHOOK_SECRET.encode(), canonical, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, (signature or "").lower()):
        return False, "signature mismatch"
    return True, "ok"


def _verify_bearer(auth_header: str | None) -> tuple[bool, str]:
    if not WEBHOOK_BEARER_TOKEN:
        return False, "WEBHOOK_BEARER_TOKEN not configured on receiver"
    if not auth_header or not auth_header.startswith("Bearer "):
        return False, "missing Authorization: Bearer header"
    token = auth_header[len("Bearer "):]
    if not hmac.compare_digest(token, WEBHOOK_BEARER_TOKEN):
        return False, "bearer token mismatch"
    return True, "ok"


def _print_event(record: dict) -> None:
    status = "VALID" if record["auth_valid"] else f"INVALID ({record['auth_reason']})"
    print(f"\n{'=' * 70}")
    print(f"[{record['received_at']}] {record['event_type']}  auth={record['auth_mode']} [{status}]")
    print(f"{record['method']} {record['path']}  event_id={record['event_id']}")
    print(f"query_params={record['query_params']}")
    print(f"client={record['client_host']}")
    print("headers:")
    print(json.dumps(record["headers"], indent=2))
    print("body:")
    print(json.dumps(record["payload"], indent=2))
    print(f"-> responded {record['response_status']} {{\"received\": true, \"auth_valid\": {str(record['auth_valid']).lower()}}}")
    print("=" * 70)


def _log_event(record: dict) -> None:
    log.info("webhook_receiver.event_received", **record)


@router.post("/{path:path}")
async def receive_webhook(path: str, request: Request) -> JSONResponse:
    raw_body = await request.body()
    client_id = request.headers.get("x-client-id")
    timestamp = request.headers.get("x-timestamp")
    signature = request.headers.get("x-signature")
    auth_header = request.headers.get("authorization")

    if signature:
        auth_mode = "HMAC_SHA256"
        valid, reason = _verify_hmac(client_id or "", timestamp or "", signature, raw_body)
    elif auth_header:
        auth_mode = "BEARER"
        valid, reason = _verify_bearer(auth_header)
    else:
        auth_mode, valid, reason = "NONE", False, "no auth headers present"

    try:
        payload = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        payload = {"_raw": raw_body.decode(errors="replace")}

    # Always acknowledge quickly, matching wallet-update.md's delivery semantics
    # (a real PAM would reject an invalid signature with 401 instead — this test
    # receiver accepts regardless so you can see every event, but reports
    # auth_valid so you can confirm the sender's signing is correct).
    response_status = 200
    response_body = {"received": True, "auth_valid": valid, "auth_reason": reason}

    record = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "method": request.method,
        "path": f"/{path}",
        "query_params": dict(request.query_params),
        "client_host": request.client.host if request.client else None,
        "headers": dict(request.headers),
        "auth_mode": auth_mode,
        "auth_valid": valid,
        "auth_reason": reason,
        "event_type": payload.get("event_type"),
        "event_id": payload.get("event_id"),
        "payload": payload,
        "response_status": response_status,
    }

    received_events.append(record)
    if len(received_events) > _MAX_KEPT_EVENTS:
        received_events.pop(0)

    _print_event(record)
    _log_event(record)

    return JSONResponse(response_body, status_code=response_status)


@router.get("/events")
async def list_events(limit: int = 50) -> list[dict]:
    return received_events[-limit:]


route_prefix = "/api/v1/webhook"
app.include_router(router, prefix=route_prefix)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "events_received": len(received_events)}
