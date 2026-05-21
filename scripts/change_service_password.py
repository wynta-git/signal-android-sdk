"""
Change the password for a service account in MongoDB.

Usage:
    python scripts/change_service_password.py --username segmentation-engine
    python scripts/change_service_password.py --username bonus-api --mongo mongodb://...
"""

import argparse
import asyncio
import getpass
import os
import sys

import bcrypt
import motor.motor_asyncio

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "pam")


async def change_password(username: str, new_password: str) -> None:
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
    db = client[MONGO_DB]
    collection = db["service_accounts"]

    doc = await collection.find_one({"username": username})
    if not doc:
        sys.exit(f"Service account '{username}' not found.")

    password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    await collection.update_one(
        {"username": username},
        {"$set": {"password_hash": password_hash}},
    )
    print(f"Password updated for: {username}")
    client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Change a PAM service account password")
    parser.add_argument("--username", required=True, help="Service account username")
    parser.add_argument("--mongo", default=None, help="MongoDB URL (overrides MONGO_URL env var)")
    parser.add_argument("--db", default=None, help="MongoDB database (overrides MONGO_DB env var)")
    args = parser.parse_args()

    if args.mongo:
        global MONGO_URL
        MONGO_URL = args.mongo
    if args.db:
        global MONGO_DB
        MONGO_DB = args.db

    password = getpass.getpass(f"New password for '{args.username}': ")
    confirm = getpass.getpass("Confirm password: ")

    if password != confirm:
        sys.exit("Passwords do not match.")
    if not password:
        sys.exit("Password cannot be empty.")

    asyncio.run(change_password(args.username, password))


if __name__ == "__main__":
    main()
