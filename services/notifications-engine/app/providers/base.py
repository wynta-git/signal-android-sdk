from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class Recipient:
    user_id: str
    token: str
    platform: str  # android | ios | web
    project_id: str
    auto_dismiss_seconds: int | None = None


@dataclass
class RenderedPayload:
    title: str
    body: str
    image_url: str | None
    extra: dict[str, Any]


@dataclass
class ProviderResult:
    provider_msg_id: str | None
    status: str  # accepted | rejected
    error: dict[str, str] | None = None


class ChannelProvider(Protocol):
    async def send(self, recipient: Recipient, payload: RenderedPayload) -> ProviderResult: ...


# ---------------------------------------------------------------------------
# Batch-oriented shapes — email (and later sms/whatsapp/telegram). Separate
# from Recipient/RenderedPayload/ChannelProvider above, which stay push-shaped
# and untouched — a batch send has one shared template plus N recipients each
# carrying their own substitution values, which doesn't fit the single-
# recipient Protocol above.
# ---------------------------------------------------------------------------


@dataclass
class EmailRecipient:
    email: str
    substitutions: dict[str, str]
    custom_args: dict[str, str]


@dataclass
class BatchProviderResult:
    status: str  # accepted | rejected
    provider_msg_id: str | None = None
    error: dict[str, str] | None = None


class EmailProvider(Protocol):
    """Contract any email vendor adapter implements (SendGrid, Mailgun, ...).
    Deliberately batch-shaped, not a single-recipient `send()` like
    ChannelProvider above — see app/providers/email.py for the registry that
    resolves which concrete adapter a brand/project is configured to use."""

    name: str

    async def send_batch(
        self,
        recipients: list[EmailRecipient],
        subject_template: str,
        html_template: str,
        text_template: str | None,
    ) -> BatchProviderResult: ...
