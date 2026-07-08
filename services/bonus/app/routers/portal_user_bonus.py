from fastapi import APIRouter, HTTPException, Query, Request
from shared.services.user import get_pam_user_id

from app.models.pam_user_bonus import (
    PAMUserBonusTransactionSummary,
    TxnDetailResponse,
)
from app.services.pam_user_bonus_service import (
    get_txn_detail_by_type,
    list_pam_user_transactions,
)

router = APIRouter(prefix="/portal/user-bonuses", tags=["portal-user-bonuses"])


async def _resolve_pam_user(request: Request, site_id: int, user_id: str) -> int:
    pam_id = await get_pam_user_id(request.app.state.redis, site_id, user_id)
    if pam_id is None:
        raise HTTPException(status_code=404, detail=f"User {user_id!r} not found")
    return pam_id


@router.get("/{user_id}/transactions", response_model=list[PAMUserBonusTransactionSummary])
async def get_transactions(
    user_id: str,
    request: Request,
    site_id: int = Query(..., ge=1),
    chip_type: str = Query("cash", pattern=r'^(cash|in_app_purchase)$'),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[PAMUserBonusTransactionSummary]:
    pam_id = await _resolve_pam_user(request, site_id, user_id)
    return await list_pam_user_transactions(pam_id, chip_type, limit, offset)


@router.get("/{user_id}/transaction-detail", response_model=TxnDetailResponse)
async def get_transaction_detail_by_type(
    user_id: str,
    request: Request,
    site_id: int = Query(..., ge=1),
    txn_id: int = Query(..., alias="id"),
    txn_type: str = Query(..., alias="type", pattern=r"^(GRANT|RELEASE|CONSUME|EXPIRY|FORFEIT)$"),
) -> TxnDetailResponse:
    pam_id = await _resolve_pam_user(request, site_id, user_id)
    return await get_txn_detail_by_type(pam_id, user_id, txn_id, txn_type)
