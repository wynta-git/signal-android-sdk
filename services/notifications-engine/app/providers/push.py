"""Push notification providers: FCM HTTP v1 (Android/web) and APNs stub (iOS)."""
from __future__ import annotations

import json
import uuid
from typing import Any

import httpx
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.providers.base import ChannelProvider, ProviderResult, Recipient, RenderedPayload
from app.providers.fcm_auth import get_token_store

log = structlog.get_logger()

_FCM_SEND_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

# Shared client — reuses TCP connections across all concurrent FCM calls
_http_client = httpx.AsyncClient(timeout=10.0)

# FCM error codes that indicate a permanently invalid token
_UNREGISTERED_ERRORS = frozenset(["NOT_FOUND", "UNREGISTERED"])


class FcmTransientError(Exception):
    """Raised on 5xx/429 from FCM so the circuit breaker records a failure."""


class FcmV1Provider:
    """Real FCM HTTP v1 provider. One instance per send job."""

    name = "fcm_v1"

    def __init__(
        self,
        project_id: str,
        credential_json: str,
        db: AsyncIOMotorDatabase,
    ) -> None:
        self._project_id = project_id
        self._credential_json = credential_json
        self._db = db
        self._token_store = get_token_store()

    async def send(self, recipient: Recipient, payload: RenderedPayload) -> ProviderResult:
        access_token = await self._token_store.get_token(self._credential_json)
        url = _FCM_SEND_URL.format(project_id=self._project_id)

        data: dict[str, str] = {
            "title": payload.title,
            "content": payload.body,
            "type": "PUSH",
            **({"image_url": payload.image_url} if payload.image_url else {}),
            **{k: str(v) for k, v in payload.extra.items()},
        }
        if recipient.auto_dismiss_seconds is not None:
            data["auto_dismiss_seconds"] = str(recipient.auto_dismiss_seconds)

        body: dict[str, Any] = {
            "message": {
                "token": recipient.token,
                "data": data,
            }
        }

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        log.info("fcm_v1.sending", user_id=recipient.user_id, token=recipient.token, body=body)
        resp = await _http_client.post(url, json=body, headers=headers)

        if resp.status_code == 200:
            msg_id: str = resp.json().get("name", f"fcm-{uuid.uuid4().hex[:12]}")
            log.info(
                "fcm_v1.sent",
                user_id=recipient.user_id,
                platform=recipient.platform,
                provider_msg_id=msg_id,
            )
            return ProviderResult(provider_msg_id=msg_id, status="accepted")

        # Parse FCM error body
        error_body: dict[str, Any] = {}
        try:
            error_body = resp.json()
        except Exception:
            pass

        fcm_status = _extract_fcm_error_status(error_body)
        log.warning(
            "fcm_v1.send_failed",
            user_id=recipient.user_id,
            http_status=resp.status_code,
            fcm_status=fcm_status,
        )

        # Permanently invalid token — clean it up, return rejected (no circuit hit)
        if resp.status_code == 404 or fcm_status in _UNREGISTERED_ERRORS:
            await _remove_stale_token(self._db, recipient)
            return ProviderResult(
                provider_msg_id=None,
                status="rejected",
                error={"code": "token_unregistered", "message": "FCM token no longer valid"},
            )

        # Transient failure — raise so circuit breaker records it
        if resp.status_code >= 500 or resp.status_code == 429:
            raise FcmTransientError(
                f"FCM transient error {resp.status_code}: {resp.text[:200]}"
            )

        # Other 4xx — bad payload or auth; return rejected without circuit hit
        return ProviderResult(
            provider_msg_id=None,
            status="rejected",
            error={"code": f"fcm_{resp.status_code}", "message": resp.text[:200]},
        )


def _extract_fcm_error_status(error_body: dict[str, Any]) -> str:
    try:
        return error_body["error"]["status"]
    except (KeyError, TypeError):
        return ""


async def _remove_stale_token(db: AsyncIOMotorDatabase, recipient: Recipient) -> None:
    try:
        await db["device_tokens"].delete_one(
            {"project_id": recipient.project_id, "token": recipient.token}
        )
        log.info("fcm_v1.stale_token_removed", user_id=recipient.user_id)
    except Exception:
        log.warning("fcm_v1.stale_token_removal_failed", user_id=recipient.user_id)


class FcmStubProvider:
    """Stub FCM provider — used when no credentials are configured (dev/test)."""

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
    """Stub APNs provider — real APNs implementation not yet built."""

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


async def get_push_provider(
    platform: str,
    project_id: str,
    db: AsyncIOMotorDatabase,
) -> ChannelProvider:
    """Route by platform, load per-project FCM credentials. Falls back to stub if unconfigured."""
    if platform == "ios":
        return ApnsStubProvider()

    from shared.clients.mongo import get_project_fcm_credential

    credential_json = await get_project_fcm_credential(db, project_id)
    if not credential_json:
        log.warning("fcm_v1.no_credentials_fallback_stub", project_id=project_id)
        return FcmStubProvider()

    fcm_project_id: str = json.loads(credential_json)["project_id"]
    return FcmV1Provider(
        project_id=fcm_project_id,
        credential_json=credential_json,
        db=db,
    )
