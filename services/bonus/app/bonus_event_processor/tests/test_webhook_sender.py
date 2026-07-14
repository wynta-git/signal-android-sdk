"""Tests for the bonus webhook sender — HTTP layer mocked via httpx.MockTransport."""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock

import httpx
import pytest

from app.bonus_event_processor.webhook_sender import (
    WebhookEndpointConfig,
    _build_headers,
    _get_s2s_client_id,
    _load_webhook_configs,
    _matching_configs,
    send_bonus_webhook,
)

_SITE_CFG_JSON = json.dumps([
    {
        "events": ["BONUS_GRANTED", "BONUS_RELEASED"],
        "url": "https://client-domain.com/api/v1/bonus/wallet-update",
        "method": "POST",
        "auth_type": "BEARER",
        "auth_token": "tok123",
        "timeout": 10,
        "retry_count": 2,
        "active": True,
    },
    {
        "events": ["BONUS_EXPIRED", "BONUS_FORFEITED"],
        "url": "https://client-domain.com/api/v1/bonus/status-update",
        "method": "POST",
        "auth_type": "HMAC_SHA256",
        "auth_token": "shh-secret",
        "client_id": "wynta-bonus",
        "retry_count": 0,
        "active": False,
    },
])


@pytest.fixture(autouse=True)
def _patch_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.bonus_event_processor.webhook_sender.asyncio.sleep", AsyncMock())


def _patch_transport(monkeypatch: pytest.MonkeyPatch, handler) -> httpx.AsyncClient:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("app.bonus_event_processor.webhook_sender._http_client", client)
    return client


# ── config parsing ────────────────────────────────────────────────────────────

def test_load_webhook_configs_parses_valid_list() -> None:
    configs = _load_webhook_configs(_SITE_CFG_JSON)
    assert len(configs) == 2
    assert configs[0].auth_type == "BEARER"
    assert configs[1].auth_type == "HMAC_SHA256"


def test_load_webhook_configs_handles_missing() -> None:
    assert _load_webhook_configs(None) == []
    assert _load_webhook_configs("") == []


def test_load_webhook_configs_handles_malformed_json() -> None:
    assert _load_webhook_configs("{not json") == []


def test_load_webhook_configs_accepts_a_single_bare_object() -> None:
    raw = json.dumps({"events": ["BONUS_GRANTED"], "url": "https://x.com", "auth_token": "t"})
    configs = _load_webhook_configs(raw)
    assert len(configs) == 1
    assert configs[0].url == "https://x.com"


def test_load_webhook_configs_rejects_non_dict_non_list_json() -> None:
    assert _load_webhook_configs(json.dumps("just a string")) == []
    assert _load_webhook_configs(json.dumps(42)) == []


def test_load_webhook_configs_unwraps_whole_webhook_config_object() -> None:
    # Real-world mistake: the whole {"webhook_config": [...]} sample gets pasted
    # verbatim into the site_configure value instead of just the inner array.
    raw = json.dumps({"webhook_config": [
        {"events": ["BONUS_GRANTED"], "url": "https://x.com", "auth_token": "t"},
    ]})
    configs = _load_webhook_configs(raw)
    assert len(configs) == 1
    assert configs[0].url == "https://x.com"


def test_load_webhook_configs_normalizes_auth_type_case() -> None:
    raw = json.dumps([{"events": ["X"], "url": "https://x.com", "auth_token": "t", "auth_type": "Bearer"}])
    configs = _load_webhook_configs(raw)
    assert configs[0].auth_type == "BEARER"


def test_load_webhook_configs_skips_invalid_entries_keeps_valid_ones() -> None:
    raw = json.dumps([
        {"events": ["BONUS_GRANTED"], "url": "https://x.com", "auth_token": "t"},
        {"missing_required_fields": True},
    ])
    configs = _load_webhook_configs(raw)
    assert len(configs) == 1
    assert configs[0].url == "https://x.com"


# ── event-to-config matching ─────────────────────────────────────────────────

def test_matching_configs_filters_by_event_and_active() -> None:
    configs = _load_webhook_configs(_SITE_CFG_JSON)
    granted = _matching_configs(configs, "BONUS_GRANTED")
    assert len(granted) == 1
    assert granted[0].url.endswith("wallet-update")

    # second config matches BONUS_EXPIRED's events list but active=False
    expired = _matching_configs(configs, "BONUS_EXPIRED")
    assert expired == []


def test_matching_configs_no_match_returns_empty() -> None:
    configs = _load_webhook_configs(_SITE_CFG_JSON)
    assert _matching_configs(configs, "SOMETHING_ELSE") == []


# ── auth header building ──────────────────────────────────────────────────────

def test_build_headers_bearer() -> None:
    cfg = WebhookEndpointConfig(events=["X"], url="https://x.com", auth_type="BEARER", auth_token="tok123")
    headers = _build_headers(cfg, b"{}", client_id=None)
    assert headers["Authorization"] == "Bearer tok123"
    assert "X-Signature" not in headers


def test_build_headers_hmac_uses_cfg_client_id_override_when_set() -> None:
    cfg = WebhookEndpointConfig(
        events=["X"], url="https://x.com", auth_type="HMAC_SHA256",
        auth_token="shh-secret", client_id="wynta-bonus",
    )
    body = b'{"a":1}'
    headers = _build_headers(cfg, body, client_id="site-s2s-client")

    # explicit cfg.client_id wins over the resolved site S2S client_id
    assert headers["X-Client-Id"] == "wynta-bonus"
    canonical = f"wynta-bonus\n{headers['X-Timestamp']}\n".encode() + body
    expected_sig = hmac.new(b"shh-secret", canonical, hashlib.sha256).hexdigest()
    assert headers["X-Signature"] == expected_sig


def test_build_headers_hmac_falls_back_to_resolved_site_client_id() -> None:
    cfg = WebhookEndpointConfig(
        events=["X"], url="https://x.com", auth_type="HMAC_SHA256", auth_token="shh-secret",
    )
    body = b'{"a":1}'
    headers = _build_headers(cfg, body, client_id="site-s2s-client")

    assert headers["X-Client-Id"] == "site-s2s-client"
    canonical = f"site-s2s-client\n{headers['X-Timestamp']}\n".encode() + body
    expected_sig = hmac.new(b"shh-secret", canonical, hashlib.sha256).hexdigest()
    assert headers["X-Signature"] == expected_sig


# ── S2S client_id resolution ──────────────────────────────────────────────────

class _FakeClient:
    def __init__(self, client_id: str, client_type: str, active: bool = True) -> None:
        self.client_id = client_id
        self.client_type = client_type
        self.active = active


async def test_get_s2s_client_id_returns_first_active_s2s_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_clients_by_site",
        AsyncMock(return_value=[
            _FakeClient("web-client", "WEB"),
            _FakeClient("s2s-client-1", "S2S"),
        ]),
    )
    assert await _get_s2s_client_id(site_id=1, redis=AsyncMock()) == "s2s-client-1"


async def test_get_s2s_client_id_returns_none_when_no_s2s_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_clients_by_site",
        AsyncMock(return_value=[_FakeClient("web-client", "WEB")]),
    )
    assert await _get_s2s_client_id(site_id=1, redis=AsyncMock()) is None


async def test_get_s2s_client_id_never_raises_on_lookup_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_clients_by_site",
        AsyncMock(side_effect=RuntimeError("db down")),
    )
    assert await _get_s2s_client_id(site_id=1, redis=AsyncMock()) is None


# ── send + retry ──────────────────────────────────────────────────────────────

async def test_send_bonus_webhook_success_no_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"ok": True})

    _patch_transport(monkeypatch, handler)
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_site_config",
        AsyncMock(return_value=_FakeSiteConfig(_SITE_CFG_JSON)),
    )

    await send_bonus_webhook(AsyncMock(), site_id=1, event_type="BONUS_GRANTED", payload={"event_id": "e1"})
    assert len(calls) == 1
    assert calls[0].headers["authorization"] == "Bearer tok123"


async def test_send_bonus_webhook_retries_on_5xx_then_gives_up(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(500)

    _patch_transport(monkeypatch, handler)
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_site_config",
        AsyncMock(return_value=_FakeSiteConfig(_SITE_CFG_JSON)),
    )

    await send_bonus_webhook(AsyncMock(), site_id=1, event_type="BONUS_GRANTED", payload={"event_id": "e1"})
    # retry_count=2 for this config -> 3 total attempts
    assert len(calls) == 3


async def test_send_bonus_webhook_does_not_retry_on_4xx(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(400)

    _patch_transport(monkeypatch, handler)
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_site_config",
        AsyncMock(return_value=_FakeSiteConfig(_SITE_CFG_JSON)),
    )

    await send_bonus_webhook(AsyncMock(), site_id=1, event_type="BONUS_GRANTED", payload={"event_id": "e1"})
    assert len(calls) == 1


async def test_send_bonus_webhook_hmac_uses_resolved_s2s_client_id(monkeypatch: pytest.MonkeyPatch) -> None:
    active_hmac_cfg = json.dumps([{
        "events": ["BONUS_EXPIRED"],
        "url": "https://client-domain.com/api/v1/bonus/status-update",
        "auth_type": "HMAC_SHA256",
        "auth_token": "shh-secret",
        "retry_count": 0,
        "active": True,
    }])
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"ok": True})

    _patch_transport(monkeypatch, handler)
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_site_config",
        AsyncMock(return_value=_FakeSiteConfig(active_hmac_cfg)),
    )
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_clients_by_site",
        AsyncMock(return_value=[_FakeClient("wynta-bonus-217", "S2S")]),
    )

    await send_bonus_webhook(AsyncMock(), site_id=217, event_type="BONUS_EXPIRED", payload={"event_id": "e1"})
    assert len(calls) == 1
    assert calls[0].headers["x-client-id"] == "wynta-bonus-217"


async def test_send_bonus_webhook_no_matching_endpoint_makes_no_request(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200)

    _patch_transport(monkeypatch, handler)
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_site_config",
        AsyncMock(return_value=_FakeSiteConfig(_SITE_CFG_JSON)),
    )

    await send_bonus_webhook(AsyncMock(), site_id=1, event_type="UNKNOWN_EVENT", payload={})
    assert calls == []


async def test_send_bonus_webhook_never_raises_on_upstream_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_site_config",
        AsyncMock(side_effect=RuntimeError("db down")),
    )
    # must not raise
    await send_bonus_webhook(AsyncMock(), site_id=1, event_type="BONUS_GRANTED", payload={})


async def test_send_bonus_webhook_missing_config_is_a_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200)

    _patch_transport(monkeypatch, handler)
    monkeypatch.setattr(
        "app.bonus_event_processor.webhook_sender.get_site_config",
        AsyncMock(return_value=_FakeSiteConfig(None)),
    )

    await send_bonus_webhook(AsyncMock(), site_id=1, event_type="BONUS_GRANTED", payload={})
    assert calls == []


class _FakeSiteConfig:
    def __init__(self, webhook_config_raw: str | None) -> None:
        self.configuration = {"webhook_config": webhook_config_raw} if webhook_config_raw else {}
