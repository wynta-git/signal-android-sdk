import pytest
from pydantic import ValidationError

from app.dsl.validator import SegmentRule

VALID_RULE = {
    "version": 1,
    "match": "all",
    "filters": [
        {
            "type": "event",
            "event_name": "purchase_completed",
            "frequency": {"op": "gte", "count": 1},
            "time_window": {"last_days": 30},
        }
    ],
}


def test_valid_rule_parses():
    rule = SegmentRule.model_validate(VALID_RULE)
    assert rule.match == "all"
    assert len(rule.filters) == 1


def test_invalid_version_rejected():
    bad = {**VALID_RULE, "version": 2}
    with pytest.raises(ValidationError):
        SegmentRule.model_validate(bad)


def test_invalid_match_rejected():
    bad = {**VALID_RULE, "match": "none"}
    with pytest.raises(ValidationError):
        SegmentRule.model_validate(bad)


def test_too_many_filters_rejected():
    filters = [
        {
            "type": "event",
            "event_name": "purchase_completed",
            "frequency": {"op": "gte", "count": 1},
            "time_window": {"last_days": 30},
        }
    ] * 11
    with pytest.raises(ValidationError):
        SegmentRule.model_validate({**VALID_RULE, "filters": filters})


def test_time_window_exceeds_max_rejected():
    bad_filter = {
        "type": "event",
        "event_name": "purchase_completed",
        "frequency": {"op": "gte", "count": 1},
        "time_window": {"last_days": 366},
    }
    with pytest.raises(ValidationError):
        SegmentRule.model_validate({**VALID_RULE, "filters": [bad_filter]})


def test_unknown_event_name_rejected():
    bad_filter = {
        "type": "event",
        "event_name": "not_a_real_event",
        "frequency": {"op": "gte", "count": 1},
        "time_window": {"last_days": 30},
    }
    with pytest.raises(ValidationError):
        SegmentRule.model_validate({**VALID_RULE, "filters": [bad_filter]})


def test_trait_filter_parses():
    rule = SegmentRule.model_validate(
        {
            "version": 1,
            "match": "any",
            "filters": [{"type": "trait", "trait": "plan", "op": "eq", "value": "pro"}],
        }
    )
    assert rule.filters[0].type == "trait"  # type: ignore[union-attr]


def test_trait_filter_value_required_unless_exists():
    with pytest.raises(ValidationError):
        SegmentRule.model_validate(
            {
                "version": 1,
                "match": "all",
                "filters": [{"type": "trait", "trait": "plan", "op": "eq"}],
            }
        )


def test_did_not_do_filter_parses():
    rule = SegmentRule.model_validate(
        {
            "version": 1,
            "match": "all",
            "filters": [
                {"type": "did_not_do", "event_name": "app_opened", "time_window": {"last_days": 7}}
            ],
        }
    )
    assert rule.filters[0].type == "did_not_do"  # type: ignore[union-attr]


def test_in_segment_filter_parses():
    rule = SegmentRule.model_validate(
        {
            "version": 1,
            "match": "all",
            "filters": [{"type": "in_segment", "segment_id": "seg_buyers"}],
        }
    )
    assert rule.filters[0].type == "in_segment"  # type: ignore[union-attr]


def test_empty_filters_rejected():
    with pytest.raises(ValidationError):
        SegmentRule.model_validate({**VALID_RULE, "filters": []})
