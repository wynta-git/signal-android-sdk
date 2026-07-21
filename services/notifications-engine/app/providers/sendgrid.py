"""SendGrid Web API v3 /mail/send adapter, batched via `personalizations`.

Mirrors push.py's structure (shared httpx.AsyncClient, transient-vs-permanent
error split, stub fallback when unconfigured) but exposes send_batch() instead
of send() — one API call can carry 1..N recipients, each with their own
substitution values, since SendGrid shares one content block per call.

This is one adapter behind the generic EmailProvider contract
(app/providers/base.py) — see app/providers/email.py for the registry that
picks which adapter a brand/project is configured to use.
"""
from __future__ import annotations

import uuid
from typing import Any

import httpx
import structlog

from app.providers.base import BatchProviderResult, EmailRecipient

log = structlog.get_logger()

_SENDGRID_SEND_URL = "https://api.sendgrid.com/v3/mail/send"

# Shared client — reuses TCP connections across all concurrent SendGrid calls
_http_client = httpx.AsyncClient(timeout=15.0)


class SendGridTransientError(Exception):
    """Raised on 5xx/429 from SendGrid so the circuit breaker records a failure."""


class SendGridProvider:
    """Real SendGrid provider. One instance per (project, brand)'s credential."""

    name = "sendgrid"

    def __init__(self, api_key: str, from_email: str, from_name: str | None) -> None:
        self._api_key = api_key
        self._from_email = from_email
        self._from_name = from_name

    async def send_batch(
        self,
        recipients: list[EmailRecipient],
        subject_template: str,
        html_template: str,
        text_template: str | None,
    ) -> BatchProviderResult:
        if not recipients:
            return BatchProviderResult(status="accepted", provider_msg_id=None)

        body: dict[str, Any] = {
            "personalizations": [
                {
                    "to": [{"email": r.email}],
                    "substitutions": r.substitutions,
                    "custom_args": r.custom_args,
                }
                for r in recipients
            ],
            "from": {
                "email": self._from_email,
                **({"name": self._from_name} if self._from_name else {}),
            },
            "subject": subject_template,
            "content": [
                *([{"type": "text/plain", "value": text_template}] if text_template else []),
                {"type": "text/html", "value": html_template},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        log.info("sendgrid.sending", recipient_count=len(recipients))
        resp = await _http_client.post(_SENDGRID_SEND_URL, json=body, headers=headers)

        if resp.status_code == 202:
            # SendGrid returns no body on success; message id comes back in a header.
            msg_id = resp.headers.get("X-Message-Id", f"sg-{uuid.uuid4().hex[:12]}")
            log.info("sendgrid.sent", recipient_count=len(recipients), provider_msg_id=msg_id)
            return BatchProviderResult(status="accepted", provider_msg_id=msg_id)

        log.warning(
            "sendgrid.send_failed",
            http_status=resp.status_code,
            recipient_count=len(recipients),
        )

        if resp.status_code >= 500 or resp.status_code == 429:
            raise SendGridTransientError(
                f"SendGrid transient error {resp.status_code}: {resp.text[:200]}"
            )

        # Other 4xx — bad payload or auth; return rejected without circuit hit
        return BatchProviderResult(
            status="rejected",
            provider_msg_id=None,
            error={"code": f"sendgrid_{resp.status_code}", "message": resp.text[:200]},
        )


class SendGridStubProvider:
    """Stub provider — used when no SendGrid credentials are configured (dev/test)."""

    name = "sendgrid_stub"

    async def send_batch(
        self,
        recipients: list[EmailRecipient],
        subject_template: str,
        html_template: str,
        text_template: str | None,
    ) -> BatchProviderResult:
        msg_id = f"stub-sg-{uuid.uuid4().hex[:12]}"
        log.info(
            "sendgrid_stub.send_batch",
            recipient_count=len(recipients),
            subject=subject_template,
            provider_msg_id=msg_id,
        )
        return BatchProviderResult(status="accepted", provider_msg_id=msg_id)
