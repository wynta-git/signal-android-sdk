from fastapi import APIRouter, HTTPException, Query, Request

from app.cache import get_redis
from app.config import settings
from app.dependencies import PortalAuthDep
from app.services.pam_users import (
    PamUserProfile,
    SegmentUserPage,
    get_pam_user_profile,
    get_pam_users_for_segment,
)

router = APIRouter()


def _db(request: Request):
    return request.app.state.mongo[settings.mongo_db]


@router.get("/pam-users/segments/{segment_id}", response_model=SegmentUserPage)
async def list_segment_users(
    ctx: PortalAuthDep,
    request: Request,
    segment_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    cursor: str | None = Query(default=None),
) -> SegmentUserPage:
    return await get_pam_users_for_segment(
        _db(request), get_redis(), ctx.project_id, segment_id, limit, cursor
    )


@router.get("/pam-users/{user_id}", response_model=PamUserProfile)
async def get_user_profile(
    ctx: PortalAuthDep,
    request: Request,
    user_id: str,
    brand_id: str = Query(...),
) -> PamUserProfile:
    profile = await get_pam_user_profile(
        _db(request), get_redis(), ctx.project_id, user_id, brand_id
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="user not found")
    return profile
