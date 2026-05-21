"""
Seed a project and generate a live API token for local development.

Usage:
    python scripts/seed_api_tokens.py
    python scripts/seed_api_tokens.py --mongo mongodb://localhost:27017 --db pam
    python scripts/seed_api_tokens.py --project-id proj_demo --project-name "Demo App"
"""

import argparse
import hashlib
import secrets
import sys
from datetime import datetime, timezone

try:
    from pymongo import MongoClient, ASCENDING
    from pymongo.errors import DuplicateKeyError
except ImportError:
    sys.exit("pymongo not installed. Run: pip install pymongo")


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def generate_token(env: str = "live") -> str:
    return f"pam_{env}_{secrets.token_urlsafe(24)}"


def ensure_indexes(db) -> None:
    db["projects"].create_index([("project_id", ASCENDING)], unique=True)
    db["tokens"].create_index([("token_hash", ASCENDING)], unique=True)
    db["tokens"].create_index([("project_id", ASCENDING), ("status", ASCENDING)])


def seed(mongo_url: str, db_name: str, project_id: str, project_name: str) -> None:
    client = MongoClient(mongo_url)
    db = client[db_name]

    ensure_indexes(db)

    now = datetime.now(timezone.utc)

    # Upsert project
    db["projects"].update_one(
        {"project_id": project_id},
        {
            "$setOnInsert": {
                "project_id": project_id,
                "name": project_name,
                "created_at": now,
                "settings": {
                    "pii_salt": secrets.token_hex(32),
                    "timezone": "UTC",
                    "retention_months": 13,
                },
            }
        },
        upsert=True,
    )
    print(f"  project : {project_id}  ({project_name})")

    # Generate token
    raw_token = generate_token("live")
    token_hash = sha256(raw_token)

    try:
        db["tokens"].insert_one(
            {
                "project_id": project_id,
                "token_hash": token_hash,
                "scope": ["events:write"],
                "status": "active",
                "created_at": now,
                "last_used_at": None,
                "revoked_at": None,
            }
        )
    except DuplicateKeyError:
        # Hash collision is astronomically unlikely; surface it rather than silently skip
        sys.exit("Token hash collision — re-run to generate a new token.")

    print(f"  token   : {raw_token}")
    print(f"  scope   : events:write")
    print()
    print("Copy the token into the PAM test client (Bearer field).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed PAM local dev data")
    parser.add_argument("--mongo", default="mongodb://localhost:27017")
    parser.add_argument("--db", default="pam")
    parser.add_argument("--project-id", default="proj_local")
    parser.add_argument("--project-name", default="Local Dev")
    args = parser.parse_args()

    print(f"\nConnecting to {args.mongo} / {args.db} ...\n")
    seed(args.mongo, args.db, args.project_id, args.project_name)


if __name__ == "__main__":
    main()
