"""Reusable outbound webhook sender for bonus lifecycle events.

Loads per-site webhook configuration via shared.services.client.get_site_config,
matches the firing event_type against configured endpoints, and delivers the
payload with configurable auth (Bearer or HMAC-SHA256) and inline retry.

Webhook delivery failures are always caught and logged here — they must never
interrupt the bonus processing flow that triggered them (send_bonus_webhook
never raises).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import random
import time
from typing import Any, Literal

import httpx
import structlog
from pydantic import BaseModel, Field, field_validator
from redis.asyncio import Redis

from app.bonus_event_processor.webhook_payloads import resulting_balance_entry
from shared.services.client import get_clients_by_site, get_site_config

log = structlog.get_logger(__name__)

# Shared client — reuses TCP connections across all webhook calls.
_http_client = httpx.AsyncClient()

_RETRY_BACKOFF = 1.0  # seconds, doubles each attempt, +/- jitter
_S2S_CLIENT_TTL = 300  # seconds


class WebhookEndpointConfig(BaseModel):
    events: list[str]
    url: str
    method: str = "POST"
    auth_type: Literal["BEARER", "HMAC_SHA256"] = "BEARER"
    auth_token: str = ""
    client_id: str | None = None
    timeout: float = 10.0
    retry_count: int = Field(default=3, ge=0)
    active: bool = True

    @field_validator("auth_type", mode="before")
    @classmethod
    def _normalize_auth_type(cls, v: object) -> object:
        return v.upper() if isinstance(v, str) else v


def _load_webhook_configs(raw: str | None) -> list[WebhookEndpointConfig]:
    """Parse the site's `webhook_config` site_configure value into endpoint configs.

    Tolerant of missing/malformed config — always returns a list, never raises.
    """
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError) as exc:
        log.warning("bonus_webhook.config_parse_failed", error=str(exc))
        return []
    # Tolerate the config being pasted as the whole {"webhook_config": [...]}
    # sample verbatim instead of just its inner value.
    if isinstance(parsed, dict) and "webhook_config" in parsed:
        parsed = parsed["webhook_config"]
    # A single endpoint config may be configured as a bare object instead of
    # being wrapped in a list — accept both shapes.
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        log.warning("bonus_webhook.config_not_a_list", got=type(parsed).__name__)
        return []

    configs: list[WebhookEndpointConfig] = []
    for entry in parsed:
        try:
            configs.append(WebhookEndpointConfig.model_validate(entry))
        except Exception as exc:
            log.warning("bonus_webhook.config_entry_invalid", entry=entry, error=str(exc))
    return configs


def _matching_configs(
    configs: list[WebhookEndpointConfig], event_type: str
) -> list[WebhookEndpointConfig]:
    return [c for c in configs if c.active and event_type in c.events]


async def _get_s2s_client_id(site_id: int, redis: Redis) -> str | None:
    """The site's S2S (server-to-server) client_id — sent as X-Client-Id on HMAC-signed webhooks."""
    try:
        clients = await get_clients_by_site(site_id, redis, _S2S_CLIENT_TTL)
    except Exception as exc:
        log.warning("bonus_webhook.s2s_client_lookup_failed", site_id=site_id, error=str(exc))
        return None
    match = next((c for c in clients if c.client_type == "S2S" and c.active), None)
    if match is None:
        log.warning("bonus_webhook.no_s2s_client_for_site", site_id=site_id)
        return None
    return match.client_id


def _build_headers(cfg: WebhookEndpointConfig, raw_body: bytes, client_id: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if cfg.auth_type == "BEARER":
        headers["Authorization"] = f"Bearer {cfg.auth_token}"
        return headers

    # HMAC_SHA256 — mirrors wallet-update.md's proposed signing scheme:
    # canonical = client_id + "\n" + timestamp + "\n" + raw_body
    # signature = hex(HMAC-SHA256(webhook_secret, canonical))
    client_id = cfg.client_id or client_id or ""
    timestamp = str(int(time.time()))
    canonical = f"{client_id}\n{timestamp}\n".encode() + raw_body
    signature = hmac.new(cfg.auth_token.encode(), canonical, hashlib.sha256).hexdigest()
    headers["X-Client-Id"] = client_id
    headers["X-Timestamp"] = timestamp
    headers["X-Signature"] = signature
    return headers


async def _send_with_retry(
    cfg: WebhookEndpointConfig,
    raw_body: bytes,
    headers: dict[str, str],
    event_type: str,
) -> bool:
    attempts = cfg.retry_count + 1
    for attempt in range(attempts):
        log.info(
            "bonus_webhook.request_initiated",
            url=cfg.url, method=cfg.method, event_type=event_type, attempt=attempt + 1,
        )
        try:
            response = await _http_client.request(
                cfg.method, cfg.url, content=raw_body, headers=headers, timeout=cfg.timeout,
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            log.warning(
                "bonus_webhook.request_failed",
                url=cfg.url, event_type=event_type, attempt=attempt + 1, error=str(exc),
            )
        else:
            log.info(
                "bonus_webhook.response_received",
                url=cfg.url, event_type=event_type, attempt=attempt + 1,
                status_code=response.status_code,
            )
            if 200 <= response.status_code < 300:
                log.info("bonus_webhook.send_success", url=cfg.url, event_type=event_type)
                return True
            if 400 <= response.status_code < 500:
                # Permanent failure — retrying won't help.
                log.error(
                    "bonus_webhook.send_failed_permanent",
                    url=cfg.url, event_type=event_type, status_code=response.status_code,
                    body=response.text[:500],
                )
                return False
            # 5xx — treated as transient, falls through to retry below.
            log.warning(
                "bonus_webhook.response_transient_error",
                url=cfg.url, event_type=event_type, status_code=response.status_code,
            )

        if attempt < attempts - 1:
            delay = _RETRY_BACKOFF * (2 ** attempt) + random.uniform(0, 0.5)
            log.info(
                "bonus_webhook.retry_attempt",
                url=cfg.url, event_type=event_type, next_attempt=attempt + 2, delay=delay,
            )
            await asyncio.sleep(delay)

    log.error("bonus_webhook.send_failed_exhausted", url=cfg.url, event_type=event_type)
    return False


async def get_resulting_balance(pam_user_id: int, chip_type: str | None) -> dict[str, str]:
    """Fetch this player's current balance snapshot for a webhook's `resulting_balance`.

    Imported lazily to avoid a circular import: pam_user_bonus_service imports
    from grant_writer, which imports from chunk_release_handler, which needs
    this helper for its own webhook emission.
    """
    from app.services.pam_user_bonus_service import get_pam_user_bonus_summary

    try:
        rows = await get_pam_user_bonus_summary(pam_user_id)
    except Exception as exc:
        log.warning("bonus_webhook.resulting_balance_failed", pam_user_id=pam_user_id, error=str(exc))
        return resulting_balance_entry(pending_bonus="0.00", bonus_balance="0.00", wagering_required="0.00")

    chip = (chip_type or "").upper()
    match = next((r for r in rows if r.chip_type.upper() == chip), None)
    if match is None:
        return resulting_balance_entry(pending_bonus="0.00", bonus_balance="0.00", wagering_required="0.00")
    return resulting_balance_entry(
        pending_bonus=match.pending_bonus,
        bonus_balance=match.bonus_balance,
        wagering_required=match.wagering_required,
    )


async def send_bonus_webhook(
    redis: Redis,
    site_id: int,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    """Publish a bonus lifecycle event to every active webhook configured for it.

    Never raises — a webhook failure (bad config, unreachable endpoint, non-2xx
    response) is logged and swallowed so it can never interrupt the bonus
    processing flow that produced this event.
    """
    log.info("bonus_webhook.event_received", site_id=site_id, event_type=event_type,
              event_id=payload.get("event_id"))
    try:
        site_cfg = await get_site_config(site_id, redis)
        raw = site_cfg.configuration.get("webhook_config") if site_cfg else None
        configs = _load_webhook_configs(raw)
        log.info("bonus_webhook.config_loaded", site_id=site_id, endpoint_count=len(configs))

        matches = _matching_configs(configs, event_type)
        if not matches:
            log.info("bonus_webhook.no_matching_endpoint", site_id=site_id, event_type=event_type)
            return

        s2s_client_id: str | None = None
        if any(c.auth_type == "HMAC_SHA256" for c in matches):
            s2s_client_id = await _get_s2s_client_id(site_id, redis)

        raw_body = json.dumps(payload).encode()
        for cfg in matches:
            headers = _build_headers(cfg, raw_body, s2s_client_id)
            await _send_with_retry(cfg, raw_body, headers, event_type)
    except Exception as exc:
        log.error(
            "bonus_webhook.unexpected_error",
            site_id=site_id, event_type=event_type, error=str(exc),
        )
