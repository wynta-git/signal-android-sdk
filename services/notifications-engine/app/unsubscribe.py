"""One-click email unsubscribe link: HMAC-signed, no state needed to verify."""
import hashlib
import hmac
from urllib.parse import urlencode

from app.config import settings


def _sign(project_id: str, user_id: str) -> str:
    payload = f"{project_id}:{user_id}".encode()
    return hmac.new(
        settings.unsubscribe_hmac_secret.encode(), payload, hashlib.sha256
    ).hexdigest()[:32]


def build_unsubscribe_url(project_id: str, user_id: str) -> str:
    qs = urlencode({"project_id": project_id, "user_id": user_id, "sig": _sign(project_id, user_id)})
    return f"{settings.public_base_url}/api/v1/email/unsubscribe?{qs}"


def verify_unsubscribe_token(project_id: str, user_id: str, sig: str) -> bool:
    return hmac.compare_digest(_sign(project_id, user_id), sig)
