from fastapi import APIRouter

from app.services.system_users import SystemUserResponse, get_system_users_by_site

router = APIRouter()


@router.get("/users", response_model=list[SystemUserResponse])
async def list_system_users(site_id: int) -> list[SystemUserResponse]:
    return await get_system_users_by_site(site_id)
