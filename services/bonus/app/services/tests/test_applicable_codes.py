"""
Tests for GET /api/v1/bonus/user-bonuses/applicable-codes

Run with:
    cd services/bonus
    uv run pytest app/services/tests/test_applicable_codes.py -v
"""

import hashlib
import hmac
import time
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

BASE = "http://test"
ENDPOINT = "/api/v1/bonus/user-bonuses/applicable-codes"
CLIENT_ID = "test-client"
SECRET = "test-secret"

# Matches the 18-column SELECT in _APPLICABLE_CODES_SQL
_FAKE_ROW = (
    1,                      # bcc.id
    "WELCOME100",           # bcc.code
    Decimal("1000.00"),     # bcc.max_amount
    None,                   # bcc.valid_from
    None,                   # bcc.valid_to
    "Welcome Bonus",        # bcc.display_title
    "Get ₹1000 on first deposit",  # bcc.display_description
    None,                   # bcc.terms_url
    None,                   # bcc.banner_image_url
    "NEW",                  # bcc.badge_text
    "Claim Now",            # bcc.cta_text
    0,                      # bcc.auto_apply  (int → bool(0) = False)
    1,                      # bcc.display_order
    "HOME",                 # bcc.display_on
    Decimal("500.00"),      # bcc.min_display_amount
    Decimal("1.5"),         # bc.wager_multiplier
    3,                      # bc.no_of_chunks
    "ONCE",                 # bc.applicability_frequency
)


def _sign(client_id: str = CLIENT_ID, secret: str = SECRET, ts_offset: int = 0) -> dict:
    ts = str(int(time.time()) + ts_offset)
    canonical = f"{client_id}\n{ts}\n".encode()
    sig = hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()
    return {"X-Client-Id": client_id, "X-Timestamp": ts, "X-Signature": sig}


@asynccontextmanager
async def _mock_connection(rows):
    cur = AsyncMock()
    cur.execute = AsyncMock()
    cur.fetchall = AsyncMock(return_value=rows)

    cur_cm = MagicMock()
    cur_cm.__aenter__ = AsyncMock(return_value=cur)
    cur_cm.__aexit__ = AsyncMock(return_value=None)

    conn = MagicMock()
    conn.cursor = MagicMock(return_value=cur_cm)
    yield conn


@pytest.fixture()
def patch_clients():
    with patch("app.auth.settings") as m:
        m.s2s_clients = {CLIENT_ID: SECRET}
        yield


@pytest.fixture()
async def http(patch_clients):
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        yield c


# ── header generation ─────────────────────────────────────────────────────────

def test_sign_returns_three_headers():
    headers = _sign()
    assert set(headers.keys()) == {"X-Client-Id", "X-Timestamp", "X-Signature"}


def test_sign_client_id_matches():
    headers = _sign(client_id="my-client")
    assert headers["X-Client-Id"] == "my-client"


def test_sign_timestamp_is_integer_string():
    headers = _sign()
    assert headers["X-Timestamp"].isdigit()


def test_sign_signature_is_64_char_hex():
    headers = _sign()
    sig = headers["X-Signature"]
    assert len(sig) == 64
    assert all(c in "0123456789abcdef" for c in sig)


def test_sign_signature_validates_against_canonical():
    headers = _sign()
    canonical = f"{headers['X-Client-Id']}\n{headers['X-Timestamp']}\n".encode()
    expected = hmac.new(SECRET.encode(), canonical, hashlib.sha256).hexdigest()
    assert headers["X-Signature"] == expected


def test_sign_different_secrets_produce_different_signatures():
    sig1 = _sign(secret="secret-a")["X-Signature"]
    sig2 = _sign(secret="secret-b")["X-Signature"]
    assert sig1 != sig2


def test_sign_different_clients_produce_different_signatures():
    sig1 = _sign(client_id="client-a")["X-Signature"]
    sig2 = _sign(client_id="client-b")["X-Signature"]
    assert sig1 != sig2


def test_sign_ts_offset_shifts_timestamp():
    now = int(time.time())
    headers = _sign(ts_offset=100)
    ts = int(headers["X-Timestamp"])
    assert abs(ts - (now + 100)) <= 1


def test_sign_stale_offset_is_outside_300s_window():
    headers = _sign(ts_offset=-301)
    ts = int(headers["X-Timestamp"])
    assert abs(time.time() - ts) > 300


# ── happy path ────────────────────────────────────────────────────────────────

async def test_returns_applicable_codes(http):
    with patch(
        "app.services.player_bonus_service.get_connection",
        return_value=_mock_connection([_FAKE_ROW]),
    ):
        resp = await http.get(
            ENDPOINT,
            params={"user_id": "player_1", "chip_type": "cash"},
            headers=_sign(),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    item = data[0]
    assert item["promo_id"] == 1
    assert item["code"] == "WELCOME100"
    assert item["max_amount"] == "1000.00"
    assert item["auto_apply"] is False
    assert item["wager_multiplier"] == "1.5"
    assert item["no_of_chunks"] == 3
    assert item["applicability_frequency"] == "ONCE"


async def test_returns_empty_list_when_no_codes(http):
    with patch(
        "app.services.player_bonus_service.get_connection",
        return_value=_mock_connection([]),
    ):
        resp = await http.get(
            ENDPOINT,
            params={"user_id": "player_1", "chip_type": "in_app_purchase"},
            headers=_sign(),
        )

    assert resp.status_code == 200
    assert resp.json() == []


# ── auth failures ─────────────────────────────────────────────────────────────

async def test_missing_auth_headers_returns_422(http):
    resp = await http.get(ENDPOINT, params={"user_id": "p1", "chip_type": "cash"})
    assert resp.status_code == 422


async def test_unknown_client_returns_401(http):
    headers = _sign()
    headers["X-Client-Id"] = "unknown-client"
    resp = await http.get(ENDPOINT, params={"user_id": "p1", "chip_type": "cash"}, headers=headers)
    assert resp.status_code == 401
    assert "Unknown client" in resp.json()["detail"]


async def test_wrong_signature_returns_401(http):
    headers = _sign()
    headers["X-Signature"] = "0" * 64
    resp = await http.get(ENDPOINT, params={"user_id": "p1", "chip_type": "cash"}, headers=headers)
    assert resp.status_code == 401
    assert "Invalid signature" in resp.json()["detail"]


async def test_stale_timestamp_returns_401(http):
    headers = _sign(ts_offset=-301)
    resp = await http.get(ENDPOINT, params={"user_id": "p1", "chip_type": "cash"}, headers=headers)
    assert resp.status_code == 401
    assert "300-second window" in resp.json()["detail"]


async def test_future_timestamp_returns_401(http):
    headers = _sign(ts_offset=301)
    resp = await http.get(ENDPOINT, params={"user_id": "p1", "chip_type": "cash"}, headers=headers)
    assert resp.status_code == 401


async def test_non_integer_timestamp_returns_401(http):
    headers = _sign()
    headers["X-Timestamp"] = "not-a-number"
    headers["X-Signature"] = "x"
    resp = await http.get(ENDPOINT, params={"user_id": "p1", "chip_type": "cash"}, headers=headers)
    assert resp.status_code == 401


# ── query param validation ────────────────────────────────────────────────────

async def test_invalid_chip_type_returns_422(http):
    with patch(
        "app.services.player_bonus_service.get_connection",
        return_value=_mock_connection([]),
    ):
        resp = await http.get(
            ENDPOINT,
            params={"user_id": "p1", "chip_type": "bitcoin"},
            headers=_sign(),
        )
    assert resp.status_code == 422


async def test_missing_user_id_returns_422(http):
    resp = await http.get(ENDPOINT, params={"chip_type": "cash"}, headers=_sign())
    assert resp.status_code == 422


async def test_empty_user_id_returns_422(http):
    resp = await http.get(ENDPOINT, params={"user_id": "", "chip_type": "cash"}, headers=_sign())
    assert resp.status_code == 422
