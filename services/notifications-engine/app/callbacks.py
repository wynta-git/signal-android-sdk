"""HTTP routes for SendGrid: inbound Event Webhook (bounces/complaints/
unsubscribes) and our own one-click unsubscribe landing page.

Distinct from PAM's own outbound `webhook` channel's HMAC signing scheme —
here SendGrid is the sender and we're the verifier, using SendGrid's own
ECDSA "Signed Event Webhook" scheme.
"""
import base64
import json
from datetime import UTC, datetime
from typing import Any

import structlog
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import load_der_public_key
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response
from shared.clients.mongo import add_suppression

from app.config import settings
from app.suppression import suppress
from app.unsubscribe import verify_unsubscribe_token

log = structlog.get_logger()

router = APIRouter()

# spamreport/unsubscribe/group_unsubscribe are always hard-suppressed; a
# "bounce" event is only hard-suppressed when its sub-type is "bounce" (not
# "blocked", which is a soft/temporary bounce that may succeed on retry).
_HARD_SUPPRESS_EVENTS = {"spamreport", "unsubscribe", "group_unsubscribe"}


def verify_sendgrid_signature(
    public_key_b64: str, payload: bytes, signature_b64: str, timestamp: str
) -> bool:
    if not signature_b64 or not timestamp:
        return False
    try:
        public_key = load_der_public_key(base64.b64decode(public_key_b64))
        signature = base64.b64decode(signature_b64)
        public_key.verify(signature, timestamp.encode() + payload, ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


async def _suppress(request: Request, project_id: str, user_id: str, channel: str, reason: str) -> None:
    db = request.app.state.db
    redis = request.app.state.redis
    now = datetime.now(UTC)
    await add_suppression(db, project_id, user_id, channel, reason, now)
    await suppress(redis, project_id, user_id, channel, reason)


@router.post("/events")
async def sendgrid_events(request: Request) -> Response:
    raw = await request.body()

    if settings.sendgrid_webhook_public_key:
        signature = request.headers.get("X-Twilio-Email-Event-Webhook-Signature", "")
        timestamp = request.headers.get("X-Twilio-Email-Event-Webhook-Timestamp", "")
        if not verify_sendgrid_signature(settings.sendgrid_webhook_public_key, raw, signature, timestamp):
            log.warning("callbacks.signature_invalid")
            return Response(status_code=401)
    else:
        log.warning("callbacks.signature_verification_disabled_no_public_key_configured")

    try:
        events = json.loads(raw)
    except Exception:
        log.exception("callbacks.invalid_payload")
        return Response(status_code=400)

    for evt in events:
        await _handle_event(request, evt)

    return Response(status_code=200)


async def _record_webhook_event(
    request: Request, project_id: str, send_id: str, user_id: str, event_type: str
) -> None:
    db = request.app.state.db
    result = await db["notification_deliveries"].update_one(
        {"project_id": project_id, "send_id": send_id, "user_id": user_id},
        {"$set": {"last_webhook_event": event_type, "last_webhook_event_at": datetime.now(UTC)}},
    )
    if result.matched_count == 0:
        log.warning(
            "callbacks.delivery_record_not_found",
            event_type=event_type, project_id=project_id, send_id=send_id,
        )


async def _handle_event(request: Request, evt: dict[str, Any]) -> None:
    event_type = evt.get("event")
    project_id = evt.get("project_id")
    user_id = evt.get("user_id")
    if not project_id or not user_id:
        log.warning("callbacks.missing_custom_args", event_type=event_type)
        return

    log.info("callbacks.event_received", event_type=event_type, project_id=project_id, user_id=user_id)

    send_id = evt.get("send_id")
    if send_id:
        await _record_webhook_event(request, project_id, send_id, user_id, event_type)

    if event_type == "bounce" and evt.get("type") == "bounce":
        await _suppress(request, project_id, user_id, "email", "hard_bounce")
    elif event_type in _HARD_SUPPRESS_EVENTS:
        await _suppress(request, project_id, user_id, "email", event_type)
    # bounce/type=blocked (soft), delivered, open, click: no suppression action.


@router.get("/unsubscribe")
async def unsubscribe(request: Request, project_id: str, user_id: str, sig: str) -> HTMLResponse:
    if not verify_unsubscribe_token(project_id, user_id, sig):
        return HTMLResponse("<h3>Invalid or expired unsubscribe link.</h3>", status_code=400)
    await _suppress(request, project_id, user_id, "email", "user_unsubscribe")
    return HTMLResponse("<h3>You have been unsubscribed from these emails.</h3>")
