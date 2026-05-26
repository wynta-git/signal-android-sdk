import uuid

import structlog

from app.providers.base import ChannelProvider, ProviderResult, Recipient, RenderedPayload

log = structlog.get_logger()


class FcmStubProvider:
    """Stub FCM provider — logs payload, always returns accepted."""

    name = "fcm_stub"

    async def send(self, recipient: Recipient, payload: RenderedPayload) -> ProviderResult:
        msg_id = f"stub-fcm-{uuid.uuid4().hex[:12]}"
        log.info(
            "fcm_stub.send",
            user_id=recipient.user_id,
            platform=recipient.platform,
            title=payload.title,
            provider_msg_id=msg_id,
        )
        return ProviderResult(provider_msg_id=msg_id, status="accepted")


class ApnsStubProvider:
    """Stub APNs provider — logs payload, always returns accepted."""

    name = "apns_stub"

    async def send(self, recipient: Recipient, payload: RenderedPayload) -> ProviderResult:
        msg_id = f"stub-apns-{uuid.uuid4().hex[:12]}"
        log.info(
            "apns_stub.send",
            user_id=recipient.user_id,
            platform=recipient.platform,
            title=payload.title,
            provider_msg_id=msg_id,
        )
        return ProviderResult(provider_msg_id=msg_id, status="accepted")


def get_push_provider(platform: str) -> ChannelProvider:
    """Route by platform: ios → APNs, everything else → FCM."""
    if platform == "ios":
        return ApnsStubProvider()
    return FcmStubProvider()
