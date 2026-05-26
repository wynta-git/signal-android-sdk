from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class Recipient:
    user_id: str
    token: str
    platform: str  # android | ios | web


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
