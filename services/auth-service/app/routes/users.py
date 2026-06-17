from fastapi import APIRouter

from app.services.users import UserResponse, get_users_by_site

router = APIRouter()


@router.get("/users", response_model=list[UserResponse])
async def list_users(site_id: int) -> list[UserResponse]:
    return await get_users_by_site(site_id)
