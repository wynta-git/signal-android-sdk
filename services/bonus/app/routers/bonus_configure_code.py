from fastapi import APIRouter

from app.dependencies import PortalAuthDep
from app.models.bonus_configure_code import (
    BonusConfigureCodeCreate,
    BonusConfigureCodeResponse,
    BonusConfigureCodeUpdate,
)
from app.services.bonus_configure_code_service import (
    add_bonus_configure_code,
    update_bonus_configure_code,
)

router = APIRouter(prefix="/bonus-configure-codes", tags=["bonus-configure-codes"])


@router.post("", response_model=BonusConfigureCodeResponse, status_code=201)
async def create_bonus_configure_code(
    payload: BonusConfigureCodeCreate,
    ctx: PortalAuthDep,
) -> BonusConfigureCodeResponse:
    payload.created_by = ctx.username
    return await add_bonus_configure_code(payload)


@router.patch("/{code_id}", response_model=BonusConfigureCodeResponse)
async def patch_bonus_configure_code(
    code_id: int,
    payload: BonusConfigureCodeUpdate,
    ctx: PortalAuthDep,
) -> BonusConfigureCodeResponse:
    payload.updated_by = ctx.username
    return await update_bonus_configure_code(code_id, payload)
