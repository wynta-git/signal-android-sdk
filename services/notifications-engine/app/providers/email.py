"""Email provider registry.

Resolves which vendor adapter (SendGrid, Mailgun, ...) a brand/project is
configured to use, and instantiates it with the right credentials. This
module is deliberately not tied to any one vendor — the actual adapters live
in app/providers/sendgrid.py and app/providers/mailgun.py, both implementing
the EmailProvider contract in app/providers/base.py. Dispatch mirrors
app/providers/push.py's get_push_provider() (plain per-vendor branches, not a
dict of function references frozen at import time — that would resolve each
vendor's credential-getter to a fixed object at module load, which is both
less obvious to extend and awkward to patch in tests).

To add a new vendor: write an adapter module implementing EmailProvider, add
a credential-getter to shared/clients/mongo.py mirroring
get_project_sendgrid_credential, and add one branch below.
"""
from __future__ import annotations

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from shared.clients.mongo import (
    get_project_email_provider_name,
    get_project_mailgun_credential,
    get_project_sendgrid_credential,
)

from app.providers.base import EmailProvider
from app.providers.mailgun import MailgunProvider, MailgunStubProvider
from app.providers.sendgrid import SendGridProvider, SendGridStubProvider

log = structlog.get_logger()


async def get_email_provider(
    project_id: str,
    db: AsyncIOMotorDatabase,
    brand_id: str | None = None,
) -> EmailProvider:
    """Load per-brand-then-per-project credentials for whichever email
    provider this brand/project is configured to use (`email_provider` on
    brand_settings/projects.settings — defaults to 'sendgrid' if unset, so
    every brand configured before this field existed keeps working
    unchanged). Falls back to that provider's own stub if unconfigured."""
    provider_name = await get_project_email_provider_name(db, project_id, brand_id=brand_id)

    if provider_name == "sendgrid":
        cred = await get_project_sendgrid_credential(db, project_id, brand_id=brand_id)
        if not cred:
            log.warning(
                "email_provider.no_credentials_fallback_stub",
                provider=provider_name,
                project_id=project_id,
                brand_id=brand_id,
            )
            return SendGridStubProvider()
        return SendGridProvider(**cred)

    if provider_name == "mailgun":
        cred = await get_project_mailgun_credential(db, project_id, brand_id=brand_id)
        if not cred:
            log.warning(
                "email_provider.no_credentials_fallback_stub",
                provider=provider_name,
                project_id=project_id,
                brand_id=brand_id,
            )
            return MailgunStubProvider()
        return MailgunProvider(**cred)

    log.error("email_provider.unknown_provider", provider=provider_name, project_id=project_id)
    return SendGridStubProvider()
