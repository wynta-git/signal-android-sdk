"""Tests for app.services.pam_users — composition of segment membership
(Redis, via shared.services.segments), traits (Mongo, via shared.clients.mongo),
and pam_id (MySQL, via shared.services.user), mocked at the shared-function
boundary since those are already covered by shared's own test suite."""

from unittest.mock import AsyncMock, patch

from app.services.pam_users import get_pam_user_profile, get_pam_users_for_segment


async def test_get_pam_users_for_segment_enriches_each_member() -> None:
    members = [{"user_id": "u1", "joined_at": "2026-01-01T00:00:00Z"}]
    profiles = {
        "u1": {
            "brand_id": "217",
            "traits": {"email": "a@example.com"},
            "first_seen_at": "t1",
            "last_seen_at": "t2",
        }
    }
    redis_obj = object()

    with (
        patch("app.services.pam_users.list_segment_members", new=AsyncMock(return_value=members)),
        patch("app.services.pam_users.get_users_batch", new=AsyncMock(return_value=profiles)),
        patch(
            "app.services.pam_users.resolve_pam_id_from_brand", new=AsyncMock(return_value=42)
        ) as resolve_mock,
    ):
        page = await get_pam_users_for_segment(
            mongo_db=object(), redis=redis_obj, project_id="proj_1",
            segment_id="seg_1", limit=100, cursor=None,
        )

    assert page.segment_id == "seg_1"
    assert page.has_more is False
    assert len(page.users) == 1
    user = page.users[0]
    assert user.user_id == "u1"
    assert user.pam_id == 42
    assert user.brand_id == "217"
    assert user.traits == {"email": "a@example.com"}
    resolve_mock.assert_awaited_once_with(redis_obj, "217", "u1")


async def test_get_pam_users_for_segment_coerces_int_brand_id() -> None:
    """Mongo stores brand_id inconsistently — some docs have it as an int, not
    a str — which used to raise a Pydantic ValidationError before brand_id
    was normalized at the read boundary."""
    members = [{"user_id": "u1", "joined_at": "2026-01-01T00:00:00Z"}]
    profiles = {"u1": {"brand_id": 217, "traits": {}, "first_seen_at": "t1", "last_seen_at": "t2"}}
    redis_obj = object()

    with (
        patch("app.services.pam_users.list_segment_members", new=AsyncMock(return_value=members)),
        patch("app.services.pam_users.get_users_batch", new=AsyncMock(return_value=profiles)),
        patch(
            "app.services.pam_users.resolve_pam_id_from_brand", new=AsyncMock(return_value=42)
        ) as resolve_mock,
    ):
        page = await get_pam_users_for_segment(
            mongo_db=object(), redis=redis_obj, project_id="proj_1",
            segment_id="seg_1", limit=100, cursor=None,
        )

    assert page.users[0].brand_id == "217"
    resolve_mock.assert_awaited_once_with(redis_obj, "217", "u1")


async def test_get_pam_user_profile_coerces_int_brand_id() -> None:
    doc = {"brand_id": 217, "traits": {}, "first_seen_at": "t1", "last_seen_at": "t2"}

    with (
        patch("app.services.pam_users.get_user", new=AsyncMock(return_value=doc)),
        patch("app.services.pam_users.resolve_pam_id_from_brand", new=AsyncMock(return_value=42)),
        patch(
            "app.services.pam_users.get_user_segment_memberships", new=AsyncMock(return_value=[])
        ),
    ):
        profile = await get_pam_user_profile(
            mongo_db=object(), redis=object(), project_id="proj_1", user_id="u1", brand_id="217"
        )

    assert profile is not None
    assert profile.brand_id == "217"


async def test_get_pam_users_for_segment_missing_profile_uses_empty_traits() -> None:
    members = [{"user_id": "u1", "joined_at": "2026-01-01T00:00:00Z"}]

    with (
        patch("app.services.pam_users.list_segment_members", new=AsyncMock(return_value=members)),
        patch("app.services.pam_users.get_users_batch", new=AsyncMock(return_value={})),
        patch("app.services.pam_users.resolve_pam_id_from_brand", new=AsyncMock(return_value=None)),
    ):
        page = await get_pam_users_for_segment(
            mongo_db=object(), redis=object(), project_id="proj_1",
            segment_id="seg_1", limit=100, cursor=None,
        )

    user = page.users[0]
    assert user.traits == {}
    assert user.pam_id is None
    assert user.brand_id is None


async def test_get_pam_users_for_segment_has_more_sets_next_cursor() -> None:
    members = [
        {"user_id": "u1", "joined_at": "t1"},
        {"user_id": "u2", "joined_at": "t2"},
        {"user_id": "u3", "joined_at": "t3"},
    ]

    with (
        patch("app.services.pam_users.list_segment_members", new=AsyncMock(return_value=members)),
        patch("app.services.pam_users.get_users_batch", new=AsyncMock(return_value={})),
        patch("app.services.pam_users.resolve_pam_id_from_brand", new=AsyncMock(return_value=None)),
    ):
        page = await get_pam_users_for_segment(
            mongo_db=object(), redis=object(), project_id="proj_1",
            segment_id="seg_1", limit=2, cursor=None,
        )

    assert page.has_more is True
    assert len(page.users) == 2
    assert page.next_cursor == "u2"


async def test_get_pam_user_profile_not_found_returns_none() -> None:
    with patch("app.services.pam_users.get_user", new=AsyncMock(return_value=None)):
        profile = await get_pam_user_profile(
            mongo_db=object(), redis=object(), project_id="proj_1", user_id="ghost", brand_id="217"
        )

    assert profile is None


async def test_get_pam_user_profile_found_includes_segments() -> None:
    doc = {
        "brand_id": "217",
        "traits": {"email": "a@example.com", "vip_level": "gold"},
        "first_seen_at": "t1",
        "last_seen_at": "t2",
        "health_status": "healthy",
    }
    segments = [{"segment_id": "seg_1", "name": "VIP"}]

    with (
        patch("app.services.pam_users.get_user", new=AsyncMock(return_value=doc)),
        patch("app.services.pam_users.resolve_pam_id_from_brand", new=AsyncMock(return_value=42)),
        patch(
            "app.services.pam_users.get_user_segment_memberships",
            new=AsyncMock(return_value=segments),
        ),
    ):
        profile = await get_pam_user_profile(
            mongo_db=object(), redis=object(), project_id="proj_1", user_id="u1", brand_id="217"
        )

    assert profile is not None
    assert profile.user_id == "u1"
    assert profile.pam_id == 42
    assert profile.traits["vip_level"] == "gold"
    assert profile.health_status == "healthy"
    assert [s.model_dump() for s in profile.segments] == [{"segment_id": "seg_1", "name": "VIP"}]
