"""Payload builders for outbound bonus lifecycle webhooks.

Pure functions — no DB/network access. Each builder returns a dict matching
the envelope schema defined in services/bonus/wallet-update.md. Callers
supply already-resolved data (player_id, resulting_balance, chunk details);
these functions only shape and format it.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any


def _dec(value: Decimal | float | str) -> str:
    # ROUND_HALF_UP to match the rest of the money pipeline (grant_writer.py,
    # chunk_release_handler.py) — quantize()'s default is banker's rounding.
    return str(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _map_chip_type(chip_type: str) -> str:
    """DB chip types (CASH/BONUS/COINS) -> wallet-update.md's cash|in_app_purchase enum."""
    return "cash" if (chip_type or "").upper() == "CASH" else "in_app_purchase"


def chunk_entry(
    *,
    chunk_ref: str,
    sequence: int,
    chunk_count: int,
    amount: Decimal | str,
    wager_amount: Decimal | str,
    status: str,
    expires_at: datetime | str | None,
) -> dict[str, Any]:
    """Build one entry of the payload's `chunks[]` array."""
    return {
        "chunk_ref": chunk_ref,
        "sequence": sequence,
        "chunk_count": chunk_count,
        "amount": _dec(amount),
        "wager_amount": str(Decimal(str(wager_amount)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
        "status": status,
        "expires_at": expires_at.isoformat() if isinstance(expires_at, datetime) else expires_at,
    }


def resulting_balance_entry(
    *,
    pending_bonus: Decimal | str,
    bonus_balance: Decimal | str,
    wagering_required: Decimal | str,
) -> dict[str, str]:
    return {
        "pending_bonus": _dec(pending_bonus),
        "bonus_balance": _dec(bonus_balance),
        "wagering_required": _dec(wagering_required),
    }


def _build_payload(
    *,
    event_type: str,
    site_id: int,
    player_id: str,
    txn_id: int,
    bonus_code: str | None,
    chip_type: str,
    amount: Decimal | str,
    wallet_effect: dict[str, str],
    chunks: list[dict[str, Any]],
    resulting_balance: dict[str, str],
    consume_txn_id: str | None = None,
) -> dict[str, Any]:
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        # Z-suffixed, no microseconds — matches wallet-update.md's exact example format.
        "occurred_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "player_id": player_id,
        "site_id": site_id,
        "txn_id": txn_id,
        "consume_txn_id": consume_txn_id,
        "bonus_code": bonus_code,
        "chip_type": _map_chip_type(chip_type),
        "amount": _dec(amount),
        "wallet_effect": wallet_effect,
        "chunks": chunks,
        "resulting_balance": resulting_balance,
    }


def build_bonus_granted_payload(
    *,
    site_id: int,
    player_id: str,
    grant_id: int,
    bonus_code: str | None,
    chip_type: str,
    grant_amount: Decimal | str,
    chunks: list[dict[str, Any]],
    resulting_balance: dict[str, str],
) -> dict[str, Any]:
    return _build_payload(
        event_type="BONUS_GRANTED",
        site_id=site_id,
        player_id=player_id,
        txn_id=grant_id,
        bonus_code=bonus_code,
        chip_type=chip_type,
        amount=grant_amount,
        wallet_effect={"pending_delta": _dec(grant_amount), "available_delta": "0.00"},
        chunks=chunks,
        resulting_balance=resulting_balance,
    )


def build_bonus_released_payload(
    *,
    site_id: int,
    player_id: str,
    grant_id: int,
    bonus_code: str | None,
    chip_type: str,
    amount: Decimal | str,
    chunks: list[dict[str, Any]],
    resulting_balance: dict[str, str],
) -> dict[str, Any]:
    return _build_payload(
        event_type="BONUS_RELEASED",
        site_id=site_id,
        player_id=player_id,
        txn_id=grant_id,
        bonus_code=bonus_code,
        chip_type=chip_type,
        amount=amount,
        wallet_effect={"pending_delta": f"-{_dec(amount)}", "available_delta": _dec(amount)},
        chunks=chunks,
        resulting_balance=resulting_balance,
    )


def build_bonus_expired_payload(
    *,
    site_id: int,
    player_id: str,
    grant_id: int,
    bonus_code: str | None,
    chip_type: str,
    amount: Decimal | str,
    chunks: list[dict[str, Any]],
    resulting_balance: dict[str, str],
) -> dict[str, Any]:
    return _build_payload(
        event_type="BONUS_EXPIRED",
        site_id=site_id,
        player_id=player_id,
        txn_id=grant_id,
        bonus_code=bonus_code,
        chip_type=chip_type,
        amount=amount,
        # Expiry acts on the still-PENDING (not yet released) remainder.
        wallet_effect={"pending_delta": f"-{_dec(amount)}", "available_delta": "0.00"},
        chunks=chunks,
        resulting_balance=resulting_balance,
    )


def build_bonus_forfeited_payload(
    *,
    site_id: int,
    player_id: str,
    grant_id: int,
    bonus_code: str | None,
    chip_type: str,
    amount: Decimal | str,
    chunks: list[dict[str, Any]],
    resulting_balance: dict[str, str],
) -> dict[str, Any]:
    return _build_payload(
        event_type="BONUS_FORFEITED",
        site_id=site_id,
        player_id=player_id,
        txn_id=grant_id,
        bonus_code=bonus_code,
        chip_type=chip_type,
        amount=amount,
        # bonus_forfeit_job only ever forfeits released-but-unconsumed
        # (available) balance — chunk expiry is what touches the pending bucket.
        wallet_effect={"pending_delta": "0.00", "available_delta": f"-{_dec(amount)}"},
        chunks=chunks,
        resulting_balance=resulting_balance,
    )
