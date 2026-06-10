"""
Unit tests for BonusHeadCreate validation.
These tests do not touch the database.
"""

import pytest
from pydantic import ValidationError

from app.exceptions import BonusHeadValidationError
from app.models.bonus_head import BonusHeadCreate
from app.services.bonus_head_service import _validate_business_rules

VALID = dict(
    site_id=1,
    name="Welcome",
    owner="priya.sharma",
    created_by="admin",
    budget=[{"period_type": "DAILY", "budget_limit": 1000}],
)


# ---------------------------------------------------------------------------
# Model validation
# ---------------------------------------------------------------------------


def test_valid_payload_passes() -> None:
    BonusHeadCreate(**VALID)


def test_name_stripped() -> None:
    m = BonusHeadCreate(**{**VALID, "name": "  Welcome  "})
    assert m.name == "Welcome"


def test_name_too_long_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "name": "A" * 101})


def test_name_empty_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "name": ""})


def test_name_whitespace_only_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "name": "   "})


def test_name_invalid_chars_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "name": "Welcome@2026"})


def test_description_too_long_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "description": "x" * 501})


def test_description_blank_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "description": "   "})


def test_description_none_is_fine() -> None:
    m = BonusHeadCreate(**{**VALID, "description": None})
    assert m.description is None


def test_site_id_zero_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "site_id": 0})


def test_site_id_negative_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "site_id": -5})


def test_owner_empty_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "owner": ""})


def test_owner_stripped() -> None:
    m = BonusHeadCreate(**{**VALID, "owner": "  priya.sharma  "})
    assert m.owner == "priya.sharma"


def test_created_by_empty_raises() -> None:
    with pytest.raises(ValidationError):
        BonusHeadCreate(**{**VALID, "created_by": ""})


def test_active_defaults_true() -> None:
    m = BonusHeadCreate(**VALID)
    assert m.active is True


def test_active_can_be_false() -> None:
    m = BonusHeadCreate(**{**VALID, "active": False})
    assert m.active is False


# ---------------------------------------------------------------------------
# Business-rule validation
# ---------------------------------------------------------------------------


def test_numeric_owner_raises() -> None:
    data = BonusHeadCreate(**{**VALID, "owner": "12345"})
    with pytest.raises(BonusHeadValidationError) as exc_info:
        _validate_business_rules(data)
    assert exc_info.value.field == "owner"


def test_numeric_created_by_raises() -> None:
    data = BonusHeadCreate(**{**VALID, "created_by": "99"})
    with pytest.raises(BonusHeadValidationError) as exc_info:
        _validate_business_rules(data)
    assert exc_info.value.field == "created_by"


def test_valid_business_rules_pass() -> None:
    data = BonusHeadCreate(**VALID)
    _validate_business_rules(data)  # must not raise
