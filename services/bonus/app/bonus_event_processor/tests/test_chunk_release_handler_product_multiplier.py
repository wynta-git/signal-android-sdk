"""Tests for handle_chunk_release's per-product wager multiplier weighting.

DB layer is mocked, no real MySQL needed — same mocked-cursor style as
test_chunk_release_handler.py. Covers the confirmed formula:

    effective_multiplier = product_wager_multiplier.get(product, base_multiplier)
    weight_ratio = base_multiplier / effective_multiplier
    weighted_contribution = raw_contributed * weight_ratio   # added to new_wager
    release_amount / event_release keep dividing by the chunk's base multiplier

A product multiplier *below* the chunk's base multiplier contributes more per
raw dollar wagered (clears faster); *above* contributes less (clears slower).
No override, or the event's product missing from the configured dict, must
behave byte-identical to the pre-existing (weight_ratio == 1) formula.
"""

import json
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.bonus_event_processor.chunk_release_handler import (
    _INSERT_BONUS_RELEASE_SQL,
    _RELEASE_CHUNK_WITH_WAGER_SQL,
    _UPDATE_GRANT_RELEASE_SQL,
    handle_chunk_release,
)
from app.models.bonus_release_trigger import BonusConfigureSummary, TriggerWithConfigResponse

_CONFIGURE_SUMMARY = BonusConfigureSummary(
    id=1, subhead_id=1, head_id=1, name="Test Configure", description=None,
    start_date=datetime(2026, 1, 1), end_date=datetime(2026, 12, 31),
    applicability_frequency="EVERYTIME", wager_multiplier=Decimal("2.00"),
    no_of_chunks=1, release_bucket=None, chunk_expiry_days=30, bonus_expiry_days=None,
    wager_chip_type="CASH", credit_chip_type="CASH",
    bonus_amount_fixed=None, bonus_amount_percent=None, bonus_amount_max=None,
    cashback_bonus_amount_fixed=None, cashback_bonus_amount_percent=None,
    cashback_bonus_amount_max=None, priority=0, active=True,
)


def _trigger(**overrides) -> TriggerWithConfigResponse:
    fields = dict(
        id=1, configure_id=1, site_id=1, trigger_type="BET_PLACED",
        release_type="CHUNK_RELEASE", min_trigger_amount=None, max_trigger_amount=None,
        payment_method=None, product=None, occurrence=0, trigger_config=None,
        active=True, configure=_CONFIGURE_SUMMARY,
    )
    fields.update(overrides)
    return TriggerWithConfigResponse(**fields)


# One PENDING chunk: chunk_amount=100.00, base wager_multiplier=2.00 ->
# required_wager_amount=200.00, curr_wager=0.00.
def _chunk_row(product_wager_multiplier=None):
    return (101, Decimal("100.00"), 55, Decimal("200.00"), Decimal("0.00"),
            Decimal("2.00"), product_wager_multiplier,
            "CH001", "WELCOME100", 1, "CASH", None, "CASH")


@pytest.fixture
def redis() -> AsyncMock:
    r = AsyncMock()
    r.exists.return_value = False
    return r


@pytest.fixture
def cur() -> AsyncMock:
    cur = AsyncMock()
    cur.lastrowid = 777
    return cur


@pytest.fixture
def conn(cur: AsyncMock) -> MagicMock:
    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cur)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor_ctx
    conn.commit = AsyncMock()
    return conn


async def test_no_product_override_matches_default_formula(
    redis: AsyncMock, conn: MagicMock, cur: AsyncMock,
) -> None:
    cur.fetchall.return_value = (_chunk_row(product_wager_multiplier=None),)
    props = {"transaction_amount": "50.00", "wager_tnx_id": "WA1"}

    await handle_chunk_release(redis, conn, pam_user_id=9001, props=props, trigger=_trigger(), event_id="evt-1")

    release_call = next(
        c for c in cur.execute.call_args_list if c.args[0] == _RELEASE_CHUNK_WITH_WAGER_SQL
    )
    new_wager, release_amount, release_status, chunk_id = release_call.args[1]
    assert new_wager == Decimal("50.00")
    assert release_amount == Decimal("25.00")
    assert release_status == "PENDING"
    assert chunk_id == 101

    grant_call = next(
        c for c in cur.execute.call_args_list if c.args[0] == _UPDATE_GRANT_RELEASE_SQL
    )
    assert grant_call.args[1] == (Decimal("25.00"), 55)


async def test_product_multiplier_below_base_clears_faster(
    redis: AsyncMock, conn: MagicMock, cur: AsyncMock,
) -> None:
    # RUMMY configured at 1.5, base is 2.00 -> weight_ratio = 2/1.5 -> counts for more.
    pwm = json.dumps({"RUMMY": 1.5})
    cur.fetchall.return_value = (_chunk_row(product_wager_multiplier=pwm),)
    props = {"transaction_amount": "50.00", "wager_tnx_id": "WA2", "product": "RUMMY"}

    await handle_chunk_release(redis, conn, pam_user_id=9001, props=props, trigger=_trigger(product="RUMMY"), event_id="evt-2")

    release_call = next(
        c for c in cur.execute.call_args_list if c.args[0] == _RELEASE_CHUNK_WITH_WAGER_SQL
    )
    new_wager, release_amount, release_status, chunk_id = release_call.args[1]
    # weighted_contribution = 50 * (2/1.5) = 66.666... -> 66.67
    assert new_wager == Decimal("66.67")
    # release_amount = 66.67 / 2 = 33.335 -> 33.34 (ROUND_HALF_UP)
    assert release_amount == Decimal("33.34")
    assert release_status == "PENDING"

    insert_release_call = next(
        c for c in cur.execute.call_args_list if c.args[0] == _INSERT_BONUS_RELEASE_SQL
    )
    assert insert_release_call.args[1][5] == "RUMMY"  # product column, unaffected by weighting


async def test_product_not_in_configured_dict_falls_back_to_base(
    redis: AsyncMock, conn: MagicMock, cur: AsyncMock,
) -> None:
    # AVIATOR is configured, but this event's product (RUMMY) is not in the dict
    # -> must fall back to the chunk's own base multiplier (weight_ratio == 1).
    pwm = json.dumps({"AVIATOR": 3.0})
    cur.fetchall.return_value = (_chunk_row(product_wager_multiplier=pwm),)
    props = {"transaction_amount": "50.00", "wager_tnx_id": "WA3", "product": "RUMMY"}

    await handle_chunk_release(redis, conn, pam_user_id=9001, props=props, trigger=_trigger(product="RUMMY"), event_id="evt-3")

    release_call = next(
        c for c in cur.execute.call_args_list if c.args[0] == _RELEASE_CHUNK_WITH_WAGER_SQL
    )
    new_wager, release_amount, release_status, chunk_id = release_call.args[1]
    assert new_wager == Decimal("50.00")
    assert release_amount == Decimal("25.00")


async def test_product_multiplier_above_base_clears_slower(
    redis: AsyncMock, conn: MagicMock, cur: AsyncMock,
) -> None:
    # AVIATOR configured at 4.00, base is 2.00 -> weight_ratio = 2/4 = 0.5 -> counts for less.
    pwm = json.dumps({"AVIATOR": 4.0})
    cur.fetchall.return_value = (_chunk_row(product_wager_multiplier=pwm),)
    props = {"transaction_amount": "50.00", "wager_tnx_id": "WA4", "product": "AVIATOR"}

    await handle_chunk_release(redis, conn, pam_user_id=9001, props=props, trigger=_trigger(product="AVIATOR"), event_id="evt-4")

    release_call = next(
        c for c in cur.execute.call_args_list if c.args[0] == _RELEASE_CHUNK_WITH_WAGER_SQL
    )
    new_wager, release_amount, _release_status, _chunk_id = release_call.args[1]
    # weighted_contribution = 50 * (2/4) = 25.00
    assert new_wager == Decimal("25.00")
    assert release_amount == Decimal("12.50")


async def test_product_multiplier_dict_already_parsed_dict_not_string(
    redis: AsyncMock, conn: MagicMock, cur: AsyncMock,
) -> None:
    # Some drivers may hand back an already-deserialized dict for a JSON column.
    cur.fetchall.return_value = (_chunk_row(product_wager_multiplier={"RUMMY": 1.5}),)
    props = {"transaction_amount": "50.00", "wager_tnx_id": "WA5", "product": "RUMMY"}

    await handle_chunk_release(redis, conn, pam_user_id=9001, props=props, trigger=_trigger(product="RUMMY"), event_id="evt-5")

    release_call = next(
        c for c in cur.execute.call_args_list if c.args[0] == _RELEASE_CHUNK_WITH_WAGER_SQL
    )
    new_wager, _release_amount, _release_status, _chunk_id = release_call.args[1]
    assert new_wager == Decimal("66.67")
