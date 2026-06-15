from typing import TYPE_CHECKING

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.exceptions import (
    DatabaseError,
    PlayerBonusAlreadyRevertedError,
    PlayerBonusConsumedError,
    PlayerBonusNotFoundError,
)
from app.models.player_bonus import (
    ApplicableCodeResponse,
    PlayerBonusConsumeCreate,
    PlayerBonusConsumedResponse,
    PlayerBonusRevertResponse,
    PlayerBonusSummaryResponse,
    PlayerBonusTransactionDetail,
    PlayerBonusTransactionSummary,
    PlayerReferralCodeResponse,
)
from app.services.player_bonus_service import (
    consume_bonus,
    get_player_bonus_summary,
    get_player_referral_code,
    get_player_transaction_detail,
    list_applicable_codes,
    list_player_transactions,
    revert_consumption,
)

if TYPE_CHECKING:
    from fastapi import FastAPI, Request

router = APIRouter(prefix="/user-bonuses", tags=["user-bonuses"])


@router.get("/applicable-codes", response_model=list[ApplicableCodeResponse])
async def get_applicable_codes(
    user_id: str = Query(..., min_length=1, max_length=50),
    chip_type: str = Query(..., pattern=r'^(cash|in_app_purchase)$'),
) -> list[ApplicableCodeResponse]:
    return await list_applicable_codes(user_id, chip_type)


@router.post("/consume", response_model=PlayerBonusConsumedResponse, status_code=201)
async def create_bonus_consumption(
    payload: PlayerBonusConsumeCreate,
) -> PlayerBonusConsumedResponse:
    return await consume_bonus(payload)


@router.post("/consume/{consume_txn_id}/revert", response_model=PlayerBonusRevertResponse)
async def revert_bonus_consumption(consume_txn_id: str) -> PlayerBonusRevertResponse:
    return await revert_consumption(consume_txn_id)


@router.get("/{user_id}/summary", response_model=list[PlayerBonusSummaryResponse])
async def get_summary(user_id: str) -> list[PlayerBonusSummaryResponse]:
    return await get_player_bonus_summary(user_id)


@router.get("/{user_id}/transactions", response_model=list[PlayerBonusTransactionSummary])
async def get_transactions(
    user_id: str,
    chip_type: str = Query(..., pattern=r'^(cash|in_app_purchase)$'),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[PlayerBonusTransactionSummary]:
    return await list_player_transactions(user_id, chip_type, limit, offset)


@router.get(
    "/{user_id}/transactions/{txn_id}",
    response_model=PlayerBonusTransactionDetail,
)
async def get_transaction_detail(
    user_id: str, txn_id: int
) -> PlayerBonusTransactionDetail:
    return await get_player_transaction_detail(user_id, txn_id)


@router.get("/{user_id}/referral-code", response_model=PlayerReferralCodeResponse)
async def get_referral_code(user_id: str) -> PlayerReferralCodeResponse:
    return await get_player_referral_code(user_id)


def register_exception_handlers(app: "FastAPI") -> None:
    from fastapi import Request  # noqa: PLC0415

    @app.exception_handler(PlayerBonusNotFoundError)
    async def handle_not_found(request: Request, exc: PlayerBonusNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(PlayerBonusConsumedError)
    async def handle_consumed(request: Request, exc: PlayerBonusConsumedError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(PlayerBonusAlreadyRevertedError)
    async def handle_already_reverted(
        request: Request, exc: PlayerBonusAlreadyRevertedError
    ) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(DatabaseError)
    async def handle_db(request: Request, exc: DatabaseError) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "A database error occurred"})
