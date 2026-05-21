from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import bcrypt
import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from shared.auth.system_token import (
    SYSTEM_JWT_ALGORITHM,
    SYSTEM_JWT_ISSUER,
    InvalidSystemTokenError,
    validate_system_jwt,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _make_doc(username: str, password: str, scope: list[str]) -> dict:
    return {"username": username, "password_hash": _hash(password), "scope": scope, "status": "active"}


# ---------------------------------------------------------------------------
# validate_system_jwt unit tests (no HTTP)
# ---------------------------------------------------------------------------


def test_validate_system_jwt_valid(rsa_key_pair: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_key_pair
    now = int(datetime.now(tz=timezone.utc).timestamp())
    payload = {
        "sub": "bonus-api",
        "iss": SYSTEM_JWT_ISSUER,
        "iat": now,
        "exp": now + 3600,
        "scope": ["segments:read"],
    }
    token = jwt.encode(payload, private_pem, algorithm=SYSTEM_JWT_ALGORITHM)
    ctx = validate_system_jwt(token, public_pem)
    assert ctx.service == "bonus-api"
    assert ctx.scope == ["segments:read"]
    assert ctx.has_scope("segments:read")
    assert not ctx.has_scope("admin")


def test_validate_system_jwt_expired(rsa_key_pair: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_key_pair
    now = int(datetime.now(tz=timezone.utc).timestamp())
    payload = {
        "sub": "bonus-api",
        "iss": SYSTEM_JWT_ISSUER,
        "iat": now - 7200,
        "exp": now - 3600,
        "scope": [],
    }
    token = jwt.encode(payload, private_pem, algorithm=SYSTEM_JWT_ALGORITHM)
    with pytest.raises(InvalidSystemTokenError):
        validate_system_jwt(token, public_pem)


def test_validate_system_jwt_wrong_key(rsa_key_pair: tuple[str, str]) -> None:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa as _rsa

    private_pem, _ = rsa_key_pair
    other_key = _rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pub = other_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    now = int(datetime.now(tz=timezone.utc).timestamp())
    payload = {
        "sub": "bonus-api",
        "iss": SYSTEM_JWT_ISSUER,
        "iat": now,
        "exp": now + 3600,
        "scope": [],
    }
    token = jwt.encode(payload, private_pem, algorithm=SYSTEM_JWT_ALGORITHM)
    with pytest.raises(InvalidSystemTokenError):
        validate_system_jwt(token, other_pub)


# ---------------------------------------------------------------------------
# POST /v1/system/token integration tests (MongoDB mocked)
# ---------------------------------------------------------------------------


@pytest.fixture()
def client(rsa_key_pair: tuple[str, str]) -> TestClient:
    private_pem, _ = rsa_key_pair
    with patch.object(settings, "jwt_private_key", private_pem):
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c


def _mock_db(doc: dict | None) -> MagicMock:
    collection = MagicMock()
    collection.find_one = AsyncMock(return_value=doc)
    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=collection)
    mongo = MagicMock()
    mongo.__getitem__ = MagicMock(return_value=db)
    return mongo


def test_get_system_token_success(client: TestClient, rsa_key_pair: tuple[str, str]) -> None:
    _, public_pem = rsa_key_pair
    doc = _make_doc("bonus-api", "secret", ["segments:read"])
    client.app.state.mongo = _mock_db(doc)

    resp = client.post("/v1/system/token", json={"username": "bonus-api", "password": "secret"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == settings.jwt_token_ttl

    ctx = validate_system_jwt(data["access_token"], public_pem)
    assert ctx.service == "bonus-api"
    assert ctx.scope == ["segments:read"]


def test_get_system_token_wrong_password(client: TestClient) -> None:
    doc = _make_doc("bonus-api", "correct", ["segments:read"])
    client.app.state.mongo = _mock_db(doc)

    resp = client.post("/v1/system/token", json={"username": "bonus-api", "password": "wrong"})
    assert resp.status_code == 401


def test_get_system_token_unknown_user(client: TestClient) -> None:
    client.app.state.mongo = _mock_db(None)

    resp = client.post("/v1/system/token", json={"username": "ghost", "password": "x"})
    assert resp.status_code == 401
