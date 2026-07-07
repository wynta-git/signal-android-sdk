from typing import TYPE_CHECKING

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app.exceptions import (
    DatabaseError,
    PAMUserBonusAlreadyRevertedError,
    PAMUserBonusConsumedError,
    PAMUserBonusNotFoundError,
)
from app.models.pam_user_bonus import (
    ApplicableCodeResponse,
    PAMUserBonusConsumeCreate,
    PAMUserBonusConsumedResponse,
    PAMUserBonusRevertResponse,
    PAMUserBonusSummaryResponse,
    PAMUserBonusTransactionDetail,
    PAMUserBonusTransactionSummary,
    PAMUserReferralCodeResponse,
    TxnDetailResponse,
    ValidateCodeRequest,
    ValidateCodeResponse,
)
from app.services.pam_user_bonus_service import (
    consume_bonus,
    get_consume_status,
    get_pam_user_bonus_summary,
    get_pam_user_referral_code,
    get_pam_user_transaction_detail,
    get_txn_detail_by_type,
    list_applicable_codes,
    list_pam_user_transactions,
    revert_consumption,
    validate_code,
)

from shared.services.client import get_client_site_id
from shared.services.user import get_or_create_pam_user, get_pam_user_id

if TYPE_CHECKING:
    from fastapi import FastAPI

router = APIRouter(prefix="/user-bonuses", tags=["user-bonuses"])


@router.get("/applicable-codes", response_model=list[ApplicableCodeResponse])
async def get_applicable_codes(
    request: Request,
    user_id: str = Query(..., min_length=1, max_length=50),
    chip_type: str = Query(..., pattern=r'^(cash|in_app_purchase)$'),
    display_on: str = Query("DEPOSIT", min_length=1, max_length=100),
    x_client_id: str = Header(..., alias="x-client-id"),
) -> list[ApplicableCodeResponse]:
    site_id = await get_client_site_id(x_client_id, request.app.state.redis)
    if site_id is None:
        raise HTTPException(status_code=401, detail="Unknown client")
    return await list_applicable_codes(
        user_id, chip_type, request.app.state.redis, site_id, display_on=display_on
    )


@router.post("/validate-code", response_model=ValidateCodeResponse)
async def validate_promo_code(
    payload: ValidateCodeRequest,
    request: Request,
    x_client_id: str = Header(..., alias="x-client-id"),
) -> ValidateCodeResponse:
    site_id = await get_client_site_id(x_client_id, request.app.state.redis)
    if site_id is None:
        raise HTTPException(status_code=401, detail="Unknown client")
    return await validate_code(
        payload.user_id, payload.chip_type, payload.code,
        payload.amount, request.app.state.redis, site_id,
    )


@router.post("/consume", response_model=PAMUserBonusConsumedResponse, status_code=201)
async def create_bonus_consumption(
    payload: PAMUserBonusConsumeCreate,
    request: Request,
    x_client_id: str = Header(..., alias="x-client-id"),
) -> PAMUserBonusConsumedResponse:
    site_id = await get_client_site_id(x_client_id, request.app.state.redis)
    if site_id is None:
        raise HTTPException(status_code=401, detail="Unknown client")
    return await consume_bonus(payload, request.app.state.redis, site_id)


@router.post("/consume/{consume_txn_id}/revert", response_model=PAMUserBonusRevertResponse)
async def revert_bonus_consumption(consume_txn_id: str) -> PAMUserBonusRevertResponse:
    return await revert_consumption(consume_txn_id)


@router.post("/consume/{consume_txn_id}/status", response_model=PAMUserBonusConsumedResponse)
async def check_bonus_consume_status(consume_txn_id: str) -> PAMUserBonusConsumedResponse:
    return await get_consume_status(consume_txn_id)


async def _resolve_pam_user(request: Request, x_client_id: str, user_id: str) -> int:
    site_id = await get_client_site_id(x_client_id, request.app.state.redis)
    if site_id is None:
        raise HTTPException(status_code=401, detail="Unknown client")
    pam_id = await get_pam_user_id(request.app.state.redis, site_id, user_id)
    if pam_id is None:
        raise HTTPException(status_code=404, detail=f"User {user_id!r} not found")
    return pam_id


@router.get("/{user_id}/summary", response_model=list[PAMUserBonusSummaryResponse])
async def get_summary(
    user_id: str,
    request: Request,
    x_client_id: str = Header(..., alias="x-client-id"),
) -> list[PAMUserBonusSummaryResponse]:
    site_id = await get_client_site_id(x_client_id, request.app.state.redis)
    if site_id is None:
        raise HTTPException(status_code=401, detail="Unknown client")
    pam_id = await get_or_create_pam_user(request.app.state.redis, site_id, user_id)
    return await get_pam_user_bonus_summary(pam_id)


@router.get("/{user_id}/transactions", response_model=list[PAMUserBonusTransactionSummary])
async def get_transactions(
    user_id: str,
    request: Request,
    chip_type: str = Query(..., pattern=r'^(cash|in_app_purchase)$'),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    x_client_id: str = Header(..., alias="x-client-id"),
) -> list[PAMUserBonusTransactionSummary]:
    pam_id = await _resolve_pam_user(request, x_client_id, user_id)
    return await list_pam_user_transactions(pam_id, chip_type, limit, offset)


@router.get(
    "/{user_id}/transactions/{txn_id}",
    response_model=PAMUserBonusTransactionDetail,
)
async def get_transaction_detail(
    user_id: str,
    txn_id: int,
    request: Request,
    x_client_id: str = Header(..., alias="x-client-id"),
) -> PAMUserBonusTransactionDetail:
    pam_id = await _resolve_pam_user(request, x_client_id, user_id)
    return await get_pam_user_transaction_detail(pam_id, user_id, txn_id)


@router.get("/{user_id}/transaction-detail", response_model=TxnDetailResponse)
async def get_transaction_detail_by_type(
    user_id: str,
    request: Request,
    txn_id: int = Query(..., alias="id"),
    txn_type: str = Query(..., alias="type", pattern=r"^(GRANT|RELEASE|CONSUME|EXPIRY|FORFEIT)$"),
    x_client_id: str = Header(..., alias="x-client-id"),
) -> TxnDetailResponse:
    pam_id = await _resolve_pam_user(request, x_client_id, user_id)
    return await get_txn_detail_by_type(pam_id, user_id, txn_id, txn_type)


@router.get("/{user_id}/referral-code", response_model=PAMUserReferralCodeResponse)
async def get_referral_code(user_id: str) -> PAMUserReferralCodeResponse:
    return await get_pam_user_referral_code(user_id)


def register_exception_handlers(app: "FastAPI") -> None:
    from fastapi import Request  # noqa: PLC0415

    @app.exception_handler(PAMUserBonusNotFoundError)
    async def handle_not_found(request: Request, exc: PAMUserBonusNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(PAMUserBonusConsumedError)
    async def handle_consumed(request: Request, exc: PAMUserBonusConsumedError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(PAMUserBonusAlreadyRevertedError)
    async def handle_already_reverted(
        request: Request, exc: PAMUserBonusAlreadyRevertedError
    ) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(DatabaseError)
    async def handle_db(request: Request, exc: DatabaseError) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "A database error occurred"})
