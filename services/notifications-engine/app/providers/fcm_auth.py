"""FCM HTTP v1 OAuth2 token management.

google.auth.transport.requests.Request is synchronous (makes a blocking
urllib3 call to the Google token endpoint). We dispatch it to a thread pool
rather than blocking the asyncio event loop.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import datetime
import json
import threading
from typing import Any

import structlog
from google.auth.transport.requests import Request
from google.oauth2 import service_account

log = structlog.get_logger()

_FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_EXPIRY_BUFFER_SECONDS = 120  # refresh 2 min before expiry

_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=4, thread_name_prefix="fcm-auth"
)


class FcmV1TokenStore:
    """
    Per-process cache of FCM OAuth2 access tokens, keyed by private_key_id.

    Thread-safe: a per-key lock ensures that when many coroutines find an
    expired token simultaneously, only one thread calls the Google token
    endpoint while the rest wait for the result.
    """

    def __init__(self) -> None:
        self._cache: dict[str, tuple[str, datetime.datetime]] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._meta_lock = threading.Lock()

    def _get_key_lock(self, key: str) -> threading.Lock:
        with self._meta_lock:
            if key not in self._locks:
                self._locks[key] = threading.Lock()
            return self._locks[key]

    def _refresh_sync(self, credential_json: str) -> str:
        """Blocking: called from thread pool executor."""
        cred_dict: dict[str, Any] = json.loads(credential_json)
        key: str = cred_dict["private_key_id"]
        lock = self._get_key_lock(key)

        with lock:
            # Double-check inside lock — another thread may have refreshed already
            cached = self._cache.get(key)
            if cached:
                token, expiry = cached
                buffer = datetime.datetime.utcnow() + datetime.timedelta(
                    seconds=_EXPIRY_BUFFER_SECONDS
                )
                if expiry > buffer:
                    return token

            creds = service_account.Credentials.from_service_account_info(
                cred_dict, scopes=[_FCM_SCOPE]
            )
            creds.refresh(Request())
            token = creds.token
            expiry = creds.expiry  # UTC-naive datetime from google-auth
            self._cache[key] = (token, expiry)
            log.debug("fcm_auth.token_refreshed", key_prefix=key[:8])
            return token

    async def get_token(self, credential_json: str) -> str:
        """Async entry point. Checks memory cache first, dispatches refresh if needed."""
        cred_dict: dict[str, Any] = json.loads(credential_json)
        key: str = cred_dict["private_key_id"]

        # Fast path: read cache without locking (GIL protects dict lookup)
        cached = self._cache.get(key)
        if cached:
            token, expiry = cached
            buffer = datetime.datetime.utcnow() + datetime.timedelta(
                seconds=_EXPIRY_BUFFER_SECONDS
            )
            if expiry > buffer:
                return token

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, self._refresh_sync, credential_json)


# Module-level singleton shared across all FcmV1Provider instances
_token_store = FcmV1TokenStore()


def get_token_store() -> FcmV1TokenStore:
    return _token_store
