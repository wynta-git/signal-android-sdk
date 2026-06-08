"""
Standalone FCM push test — no Kafka, Mongo, or Redis required.

Usage:
    1. Save your Firebase service account JSON to a file, e.g. fcm_cred.json
    2. Set CREDENTIAL_FILE and DEVICE_TOKEN below.
    3. Run:  python test_fcm_push.py
"""

import asyncio
import json
import pathlib

import httpx
from google.auth.transport.requests import Request
from google.oauth2 import service_account

# ── Fill these in ────────────────────────────────────────────────────────────

CREDENTIAL_FILE = "fcm_cred.json"

DEVICE_TOKEN = "cKsMrwDYRiKXULxJX_jLCf:APA91bG9zSB1eUfFeVV9rdm7yOXv9eFIUq3f20fhJ0EIsbf-0eCwny7lrmmkkfKMUhSflsz2rvyv1MWudwk92WiAwaj7rc22cKWFJt1lUU-vs7mtPn8sTl8"

TITLE = "PAM Test"
BODY  = "Hello from the notifications-engine test script."

# ─────────────────────────────────────────────────────────────────────────────


def get_access_token(credential_json: str) -> str:
    cred_dict = json.loads(credential_json)
    creds = service_account.Credentials.from_service_account_info(
        cred_dict,
        scopes=["https://www.googleapis.com/auth/firebase.messaging"],
    )
    creds.refresh(Request())
    return creds.token


async def send_push(credential_json: str, device_token: str, title: str, body: str) -> None:
    cred_dict = json.loads(credential_json)
    firebase_project_id = cred_dict["project_id"]

    print(f"[1] Getting OAuth2 token for Firebase project: {firebase_project_id}")
    access_token = get_access_token(credential_json)
    print(f"[1] Token obtained (first 20 chars): {access_token[:20]}...")

    url = f"https://fcm.googleapis.com/v1/projects/{firebase_project_id}/messages:send"
    payload = {
        "message": {
            "token": device_token,
            "data": {
                "title": "",
                "content": "",
                "type": "PUSH",
            },
        }
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    print(f"[2] POSTing to: {url}")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload, headers=headers)

    print(f"[3] HTTP status: {resp.status_code}")
    print(f"[3] Response body: {resp.text}")

    if resp.status_code == 200:
        msg_id = resp.json().get("name", "(no name in response)")
        print(f"\n SUCCESS — FCM message ID: {msg_id}")
    else:
        print("\n FAILED — see response body above for the FCM error detail.")


if __name__ == "__main__":
    credential_json = pathlib.Path(CREDENTIAL_FILE).read_text(encoding="utf-8")
    asyncio.run(send_push(credential_json, DEVICE_TOKEN, TITLE, BODY))
