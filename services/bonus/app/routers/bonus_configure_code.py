from fastapi import APIRouter, Request

from app.dependencies import PortalAuthDep
from app.models.bonus_configure_code import (
    BonusConfigureCodeCreate,
    BonusConfigureCodeResponse,
    BonusConfigureCodeUpdate,
)
from app.services.bonus_configure_code_service import (
    add_bonus_configure_code,
    get_bonus_configure_code,
    update_bonus_configure_code,
)

router = APIRouter(prefix="/bonus-configure-codes", tags=["bonus-configure-codes"])


@router.get("/{code_id}", response_model=BonusConfigureCodeResponse)
async def get_bonus_configure_code_route(
    code_id: int,
    ctx: PortalAuthDep,
) -> BonusConfigureCodeResponse:
    return await get_bonus_configure_code(code_id)


@router.post("", response_model=BonusConfigureCodeResponse, status_code=201)
async def create_bonus_configure_code(
    payload: BonusConfigureCodeCreate,
    ctx: PortalAuthDep,
    request: Request,
) -> BonusConfigureCodeResponse:
    payload.created_by = ctx.user_id
    return await add_bonus_configure_code(payload, request.app.state.redis)


@router.patch("/{code_id}", response_model=BonusConfigureCodeResponse)
async def patch_bonus_configure_code(
    code_id: int,
    payload: BonusConfigureCodeUpdate,
    ctx: PortalAuthDep,
    request: Request,
) -> BonusConfigureCodeResponse:
    payload.updated_by = ctx.user_id
    return await update_bonus_configure_code(code_id, payload, request.app.state.redis)
