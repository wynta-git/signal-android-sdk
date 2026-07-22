"""Mailgun adapter — NOT YET IMPLEMENTED.

Exists to prove the email provider registry (app/providers/email.py) is not
tightly coupled to SendGrid: a brand/project configured with
`email_provider: "mailgun"` resolves to this real class (not a SendGrid
fallback), and only fails at the point of actually sending. Credential
resolution (shared.clients.mongo.get_project_mailgun_credential) and the
brand->project fallback pattern are already fully wired — only the actual
Mailgun API call is missing.

Mailgun's auth model is api_key + domain (not api_key + from_email like
SendGrid), and its personalization mechanism uses `recipient-variables`
rather than SendGrid's `substitutions` — implementing send_batch() for real
will need to translate EmailRecipient.substitutions into that shape, or do a
manual string-replace over the shared template before sending.
"""
from __future__ import annotations

import structlog

from app.providers.base import BatchProviderResult, EmailRecipient

log = structlog.get_logger()


class MailgunProvider:
    """Real Mailgun provider — send_batch() is intentionally unimplemented."""

    name = "mailgun"

    def __init__(self, api_key: str, domain: str, from_email: str, from_name: str | None) -> None:
        self._api_key = api_key
        self._domain = domain
        self._from_email = from_email
        self._from_name = from_name

    async def send_batch(
        self,
        recipients: list[EmailRecipient],
        subject_template: str,
        html_template: str,
        text_template: str | None,
    ) -> BatchProviderResult:
        raise NotImplementedError(
            "Mailgun provider is not yet implemented — credential resolution and "
            "registry dispatch are wired up, but no API call has been built."
        )


class MailgunStubProvider:
    """Stub provider — used when no Mailgun credentials are configured (dev/test),
    mirroring SendGridStubProvider's shape for consistency."""

    name = "mailgun_stub"

    async def send_batch(
        self,
        recipients: list[EmailRecipient],
        subject_template: str,
        html_template: str,
        text_template: str | None,
    ) -> BatchProviderResult:
        log.warning(
            "mailgun_stub.send_batch_not_implemented",
            recipient_count=len(recipients),
        )
        return BatchProviderResult(
            status="rejected",
            provider_msg_id=None,
            error={"code": "mailgun_not_implemented", "message": "Mailgun provider not yet implemented"},
        )
