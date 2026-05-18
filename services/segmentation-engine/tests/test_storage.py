"""
Integration tests for storage.py — requires a real MongoDB instance.
Set MONGO_URL env var or use the default localhost:27017.
"""
import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient

from app import storage

MONGO_URL = "mongodb://admin:glgpam2026@localhost:27017"
TEST_DB = "pam_test"
PROJECT_ID = "proj_test"
SEGMENT_ID = "seg_test"


@pytest_asyncio.fixture
async def db():
    client = AsyncIOMotorClient(MONGO_URL)
    database = client[TEST_DB]
    yield database
    await database[storage.SEGMENTS_COL].delete_many({"project_id": PROJECT_ID})
    await database[storage.MEMBERSHIPS_COL].delete_many({"project_id": PROJECT_ID})
    client.close()


@pytest.mark.asyncio
async def test_create_and_get_segment(db):
    doc = {
        "project_id": PROJECT_ID,
        "segment_id": SEGMENT_ID,
        "name": "Test Segment",
        "rule": {"version": 1, "match": "all", "filters": []},
        "refresh_strategy": "scheduled",
        "scheduled_cron": "0 */6 * * *",
        "size": None,
        "computed_at": None,
    }
    await storage.create_segment(db, doc)
    fetched = await storage.get_segment(db, PROJECT_ID, SEGMENT_ID)
    assert fetched is not None
    assert fetched["segment_id"] == SEGMENT_ID
    assert fetched["name"] == "Test Segment"


@pytest.mark.asyncio
async def test_update_segment(db):
    doc = {
        "project_id": PROJECT_ID,
        "segment_id": SEGMENT_ID,
        "name": "Old Name",
        "rule": {},
        "refresh_strategy": "on_event",
        "scheduled_cron": None,
        "size": None,
        "computed_at": None,
    }
    await storage.create_segment(db, doc)
    updated = await storage.update_segment(db, PROJECT_ID, SEGMENT_ID, {"name": "New Name"})
    assert updated is True
    fetched = await storage.get_segment(db, PROJECT_ID, SEGMENT_ID)
    assert fetched["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_segment_also_clears_memberships(db):
    doc = {
        "project_id": PROJECT_ID,
        "segment_id": SEGMENT_ID,
        "name": "To Delete",
        "rule": {},
        "refresh_strategy": "on_event",
        "scheduled_cron": None,
        "size": None,
        "computed_at": None,
    }
    await storage.create_segment(db, doc)
    await storage.upsert_membership(db, PROJECT_ID, SEGMENT_ID, "user_1")

    deleted = await storage.delete_segment(db, PROJECT_ID, SEGMENT_ID)
    assert deleted is True

    fetched = await storage.get_segment(db, PROJECT_ID, SEGMENT_ID)
    assert fetched is None

    members = await storage.get_segment_member_ids(db, PROJECT_ID, SEGMENT_ID)
    assert len(members) == 0


@pytest.mark.asyncio
async def test_bulk_upsert_memberships_idempotent(db):
    await storage.bulk_upsert_memberships(db, PROJECT_ID, SEGMENT_ID, {"u1", "u2", "u3"})
    await storage.bulk_upsert_memberships(db, PROJECT_ID, SEGMENT_ID, {"u2", "u3", "u4"})

    members = await storage.get_segment_member_ids(db, PROJECT_ID, SEGMENT_ID)
    assert members == {"u1", "u2", "u3", "u4"}


@pytest.mark.asyncio
async def test_get_user_segment_ids(db):
    await storage.upsert_membership(db, PROJECT_ID, "seg_a", "user_x")
    await storage.upsert_membership(db, PROJECT_ID, "seg_b", "user_x")

    segment_ids = await storage.get_user_segment_ids(db, PROJECT_ID, "user_x")
    assert set(segment_ids) == {"seg_a", "seg_b"}

    await db[storage.MEMBERSHIPS_COL].delete_many({"project_id": PROJECT_ID, "user_id": "user_x"})
