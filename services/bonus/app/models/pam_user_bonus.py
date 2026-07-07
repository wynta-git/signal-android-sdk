from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field


# ── API 1: applicable codes ───────────────────────────────────────────────────

class ApplicableCodeResponse(BaseModel):
    promo_id: int
    code: str
    max_amount: Decimal | None
    valid_from: datetime | None
    valid_to: datetime | None
    display_title: str | None
    display_description: str | None
    terms_url: str | None
    banner_image_url: str | None
    badge_text: str | None
    cta_text: str | None
    auto_apply: bool
    display_order: int
    display_on: str | None
    min_display_amount: Decimal | None
    wager_multiplier: Decimal
    no_of_chunks: int | None
    applicability_frequency: str | None


# ── API 1b: validate code ─────────────────────────────────────────────────────

class ValidateCodeRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=50)
    chip_type: str = Field(..., pattern=r'^(cash|in_app_purchase)$')
    code: str = Field(..., min_length=1, max_length=50)
    amount: Decimal | None = Field(None, ge=0)


class ValidateCodeResponse(BaseModel):
    valid: bool
    code: str
    reason: str | None = None
    promo_id: int | None = None
    display_title: str | None = None
    wager_multiplier: Decimal | None = None
    no_of_chunks: int | None = None


# ── API 2: consume ────────────────────────────────────────────────────────────

class PAMUserBonusConsumeCreate(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=100)
    consume_txn_id: str = Field(..., min_length=1, max_length=100)
    transaction_amount: Decimal = Field(..., ge=0)
    bonus_amount: Decimal = Field(..., ge=0)
    chip_type: str = Field(..., pattern=r'^(CASH|LOYALTY_PINTS|FUN_CHIPS)$')
    wager_tnx_id: str | None = Field(None, max_length=100)
    session_key: str | None = Field(None, max_length=200)
    platform_client_id: str | None = Field(None, max_length=100)
    product: str | None = Field(None, max_length=100)
    game_type: str | None = Field(None, pattern=r'^(GAME|TOURNEY|CONTEST)$')
    game_variant: str | None = Field(None, max_length=100)
    game_name: str | None = Field(None, max_length=200)
    game_action: str | None = Field(None, max_length=100)
    primary_transaction_id: int | None = None
    secondary_transaction_id: int | None = None
    tertiary_transaction_id: int | None = None
    base_request_id: int | None = None


class PAMUserBonusConsumedResponse(BaseModel):
    txn_id: int
    consume_txn_id: str
    bonus_amount: Decimal
    consumed_amount: Decimal
    chip_type: str


# ── API 3: revert ─────────────────────────────────────────────────────────────

class PAMUserBonusRevertResponse(BaseModel):
    txn_id: int
    consume_txn_id: str
    amount: Decimal
    chip_type: str


# ── API 4: summary ────────────────────────────────────────────────────────────

class PAMUserBonusSummaryResponse(BaseModel):
    chip_type: str
    bonus_balance: Decimal
    pending_bonus: Decimal
    wagering_required: Decimal
    wagering_done: Decimal


# ── API 5: referral code ─────────────────────────────────────────────────────

class PAMUserReferralCodeResponse(BaseModel):
    user_id: str
    referral_code: str
    created_at: datetime


# ── API 7: transaction list ───────────────────────────────────────────────────

class PAMUserBonusTransactionSummary(BaseModel):
    txn_id: int
    bonus_code: str | None
    amount: Decimal
    type: str
    created_at: datetime
    release_amount: Decimal | None = None
    consumed_amount: Decimal | None = None
    expiry_amount: Decimal | None = None
    forfeit_amount: Decimal | None = None
    grant_txn_id: int | None = None


# ── API 8: transaction detail ─────────────────────────────────────────────────

class ChunkReleaseEvent(BaseModel):
    id: int
    chunk_id: int
    wager_ref: str
    wager_amount: Decimal
    release_amount: Decimal
    created_at: datetime


class ChunkConsumeEvent(BaseModel):
    id: int
    chunk_id: int
    consumed_ref: str
    wager_ref: str | None
    consumed_amount: Decimal
    created_at: datetime


class BonusChunkDetail(BaseModel):
    id: int
    chunk_ref: str
    chunk_amount: Decimal
    wager_multiplier: Decimal
    release_status: str
    required_wager_amount: Decimal
    wager_amount: Decimal
    created_at: datetime
    updated_at: datetime
    consume_status: str
    releases: list[ChunkReleaseEvent] = []
    consumes: list[ChunkConsumeEvent] = []


class BonusForfeitDetail(BaseModel):
    id: int
    requested_amount: Decimal
    amount: Decimal
    type: str
    operator: str | None
    forfeited_at: datetime


class BonusExpiryDetail(BaseModel):
    id: int
    chunk_id: int
    amount: Decimal
    type: str
    operator: str | None
    expired_at: datetime


class PAMUserBonusTransactionDetail(BaseModel):
    txn_id: int
    user_id: str
    bonus_code: str | None
    wager_multiplier: Decimal
    no_of_chunks: int
    chunk_expiry_days: int | None
    bonus_expiry_days: int | None
    wager_chip_type: str
    credit_chip_type: str
    grant_amount: Decimal
    release_amount: Decimal
    bonus_consumed: Decimal
    status: str
    created_at: datetime
    chunks: list[BonusChunkDetail]
    forfeit: BonusForfeitDetail | None
    expiry_events: list[BonusExpiryDetail]


# ── API 9: per-type transaction detail ────────────────────────────────────────

class ChunkReleaseRow(BaseModel):
    id: int
    chunk_ref: str
    wager_amount: Decimal
    release_amount: Decimal
    bonus_grant_id: int


class ChunkConsumedRow(BaseModel):
    id: int
    chunk_ref: str
    consumed_amount: Decimal
    bonus_grant_id: int


class GrantTxnDetail(PAMUserBonusTransactionDetail):
    type: Literal["GRANT"] = "GRANT"


class ReleaseTxnDetail(BaseModel):
    type: Literal["RELEASE"] = "RELEASE"
    id: int
    wager_ref: str
    chip_type: str | None
    product: str | None
    game_type: str | None
    game_name: str | None
    wager_amount: Decimal
    release_amount: Decimal
    created_at: datetime
    chunks: list[ChunkReleaseRow]


class ConsumeTxnDetail(BaseModel):
    type: Literal["CONSUME"] = "CONSUME"
    id: int
    wager_ref: str | None
    chip_type: str | None
    product: str | None
    game_type: str | None
    game_name: str | None
    amount: Decimal
    consumed_amount: Decimal
    wager_amount: Decimal
    created_at: datetime
    chunks: list[ChunkConsumedRow]


class ExpiryTxnDetail(BaseModel):
    type: Literal["EXPIRY"] = "EXPIRY"
    id: int
    chunk_id: int
    chunk_ref: str
    amount: Decimal
    expiry_type: str
    operator: str | None
    expired_at: datetime


class ForfeitTxnDetail(BaseModel):
    type: Literal["FORFEIT"] = "FORFEIT"
    id: int
    bonus_grant_id: int
    requested_amount: Decimal
    amount: Decimal
    forfeit_type: str
    operator: str | None
    forfeited_at: datetime


TxnDetailResponse = Annotated[
    GrantTxnDetail | ReleaseTxnDetail | ConsumeTxnDetail | ExpiryTxnDetail | ForfeitTxnDetail,
    Field(discriminator="type"),
]
