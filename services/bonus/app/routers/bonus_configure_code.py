from fastapi import APIRouter

from app.models.bonus_configure_code import (
    BonusConfigureCodeCreate,
    BonusConfigureCodeResponse,
)
from app.services.bonus_configure_code_service import add_bonus_configure_code

router = APIRouter(prefix="/bonus-configure-codes", tags=["bonus-configure-codes"])


@router.post("", response_model=BonusConfigureCodeResponse, status_code=201)
async def create_bonus_configure_code(
    payload: BonusConfigureCodeCreate,
) -> BonusConfigureCodeResponse:
    """
    Attach a custom promo code to an existing bonus configure.

    - **configure_id**: parent bonus_configure id
    - **site_id**: positive integer identifying the site
    - **code**: the promo code string (must be unique and active per site)
    - **display_on**: comma-separated flows where this code appears (default: DEPOSIT)
    - **auto_apply**: whether to pre-fill the code silently (default: false)
    - **created_by**: actor performing the creation
    """
    return await add_bonus_configure_code(payload)
