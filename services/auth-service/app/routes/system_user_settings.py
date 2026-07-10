from fastapi import APIRouter
from shared.services.system_user import get_system_user_id_by_external_id

from app.cache import get_redis
from app.dependencies import PortalAuthDep
from app.services.system_user_settings import get_ui_settings_for_user

router = APIRouter()


@router.get("/users/me/settings", response_model=dict[str, str])
async def get_my_settings(ctx: PortalAuthDep) -> dict[str, str]:
    if not ctx.user_id:
        return {}

    system_user_id = await get_system_user_id_by_external_id(ctx.user_id, get_redis())
    if system_user_id is None:
        return {}

    return await get_ui_settings_for_user(system_user_id)
