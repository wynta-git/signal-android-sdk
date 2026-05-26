"""
Seed initial service accounts into MongoDB.

Usage:
    uv run python scripts/seed_service_accounts.py

Set MONGO_URL env var if not using the default. On success, prints the
accounts created/updated. Run with --dry-run to preview without writing.
"""

import argparse
import asyncio
import os

import bcrypt
import motor.motor_asyncio

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "pam")

# Define the service accounts to seed.
# In production, replace plaintext passwords with values from your secrets manager.
ACCOUNTS = [
    {
        "username": "portal-ui",
        "password": "glgportal2026",
        "scope": ["segments:read", "segments:write", "campaigns:read", "campaigns:write"],
    },

    {
        "username": "bonus-api",
        "password": "change-me-bonus-api",
        "scope": ["segments:read", "campaigns:read"],
    },
    {
        "username": "campaign-engine",
        "password": "change-me-campaign-engine",
        "scope": ["segments:read"],
    },
    {
        "username": "segmentation-engine",
        "password": "change-me-segmentation-engine",
        "scope": ["segments:read"],
    },
]


async def seed(dry_run: bool) -> None:
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
    db = client[MONGO_DB]
    collection = db["service_accounts"]

    for account in ACCOUNTS:
        username = account["username"]
        password_hash = bcrypt.hashpw(account["password"].encode(), bcrypt.gensalt()).decode()

        doc = {
            "username": username,
            "password_hash": password_hash,
            "scope": account["scope"],
            "status": "active",
        }

        if dry_run:
            print(f"[dry-run] would upsert: {username} scope={account['scope']}")
            continue

        await collection.update_one(
            {"username": username},
            {"$set": doc},
            upsert=True,
        )
        print(f"upserted: {username} scope={account['scope']}")

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed PAM service accounts")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()
    asyncio.run(seed(dry_run=args.dry_run))
