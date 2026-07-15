"""Tests for webhook payload builders — pure functions, no DB/network."""

from decimal import Decimal

from app.bonus_event_processor.webhook_payloads import (
    _map_chip_type,
    build_bonus_expired_payload,
    build_bonus_forfeited_payload,
    build_bonus_granted_payload,
    build_bonus_released_payload,
    chunk_entry,
    resulting_balance_entry,
)

_BALANCE = resulting_balance_entry(
    pending_bonus="333.33", bonus_balance="166.67", wagering_required="1000.00",
)


def _sample_chunk() -> dict:
    return chunk_entry(
        chunk_ref="CH002", sequence=2, chunk_count=3,
        amount=Decimal("166.67"), wager_amount=Decimal("600.0000"),
        status="RELEASE", expires_at=None,
    )


def test_chunk_entry_formats_amounts_as_decimal_strings() -> None:
    entry = _sample_chunk()
    assert entry == {
        "chunk_ref": "CH002", "sequence": 2, "chunk_count": 3,
        "amount": "166.67", "wager_amount": "600.0000",
        "status": "RELEASE", "expires_at": None,
    }


def test_build_bonus_granted_payload_shape() -> None:
    payload = build_bonus_granted_payload(
        site_id=1, player_id="player-123", grant_id=15, bonus_code="WELCOME100",
        chip_type="CASH", grant_amount=Decimal("500.00"),
        chunks=[_sample_chunk()], resulting_balance=_BALANCE,
    )
    assert payload["event_type"] == "BONUS_GRANTED"
    assert payload["site_id"] == 1
    assert payload["player_id"] == "player-123"
    assert payload["txn_id"] == 15
    assert payload["consume_txn_id"] is None
    assert payload["bonus_code"] == "WELCOME100"
    assert payload["chip_type"] == "cash"
    assert payload["amount"] == "500.00"
    assert payload["wallet_effect"] == {"pending_delta": "500.00", "available_delta": "0.00"}
    assert payload["chunks"] == [_sample_chunk()]
    assert payload["resulting_balance"] == _BALANCE
    assert "event_id" in payload and "occurred_at" in payload


def test_build_bonus_released_payload_wallet_effect() -> None:
    payload = build_bonus_released_payload(
        site_id=1, player_id="player-123", grant_id=15, bonus_code="WELCOME100",
        chip_type="CASH", amount=Decimal("166.67"),
        chunks=[_sample_chunk()], resulting_balance=_BALANCE,
    )
    assert payload["event_type"] == "BONUS_RELEASED"
    assert payload["wallet_effect"] == {"pending_delta": "-166.67", "available_delta": "166.67"}


def test_build_bonus_expired_payload_only_touches_pending_bucket() -> None:
    payload = build_bonus_expired_payload(
        site_id=1, player_id="player-123", grant_id=15, bonus_code="WELCOME100",
        chip_type="CASH", amount=Decimal("70.00"),
        chunks=[_sample_chunk()], resulting_balance=_BALANCE,
    )
    assert payload["event_type"] == "BONUS_EXPIRED"
    assert payload["wallet_effect"] == {"pending_delta": "-70.00", "available_delta": "0.00"}


def test_build_bonus_forfeited_payload_only_touches_available_bucket() -> None:
    payload = build_bonus_forfeited_payload(
        site_id=1, player_id="player-123", grant_id=15, bonus_code="WELCOME100",
        chip_type="CASH", amount=Decimal("60.00"),
        chunks=[_sample_chunk()], resulting_balance=_BALANCE,
    )
    assert payload["event_type"] == "BONUS_FORFEITED"
    assert payload["wallet_effect"] == {"pending_delta": "0.00", "available_delta": "-60.00"}


def test_map_chip_type_cash_and_in_app_purchase() -> None:
    assert _map_chip_type("CASH") == "cash"
    assert _map_chip_type("cash") == "cash"
    assert _map_chip_type("BONUS") == "in_app_purchase"
    assert _map_chip_type("COINS") == "in_app_purchase"
    assert _map_chip_type("") == "in_app_purchase"


def test_build_payload_maps_bonus_and_coins_chip_types() -> None:
    payload = build_bonus_granted_payload(
        site_id=1, player_id="p", grant_id=1, bonus_code=None, chip_type="BONUS",
        grant_amount=Decimal("1.00"), chunks=[], resulting_balance=_BALANCE,
    )
    assert payload["chip_type"] == "in_app_purchase"

    payload2 = build_bonus_granted_payload(
        site_id=1, player_id="p", grant_id=1, bonus_code=None, chip_type="COINS",
        grant_amount=Decimal("1.00"), chunks=[], resulting_balance=_BALANCE,
    )
    assert payload2["chip_type"] == "in_app_purchase"


def test_each_payload_has_a_unique_event_id() -> None:
    p1 = build_bonus_granted_payload(
        site_id=1, player_id="p", grant_id=1, bonus_code=None, chip_type="CASH",
        grant_amount=Decimal("1.00"), chunks=[], resulting_balance=_BALANCE,
    )
    p2 = build_bonus_granted_payload(
        site_id=1, player_id="p", grant_id=1, bonus_code=None, chip_type="CASH",
        grant_amount=Decimal("1.00"), chunks=[], resulting_balance=_BALANCE,
    )
    assert p1["event_id"] != p2["event_id"]
