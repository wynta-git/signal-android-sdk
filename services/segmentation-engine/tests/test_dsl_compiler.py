from app.dsl.compiler import compile_rule
from app.dsl.validator import SegmentRule

PROJECT_ID = "proj_test"


def _rule(filters: list) -> SegmentRule:
    return SegmentRule.model_validate({"version": 1, "match": "all", "filters": filters})


def test_event_filter_produces_sql():
    rule = _rule(
        [
            {
                "type": "event",
                "event_name": "purchase_completed",
                "frequency": {"op": "gte", "count": 2},
                "time_window": {"last_days": 30},
            }
        ]
    )
    compiled = compile_rule(rule, PROJECT_ID, {})

    assert len(compiled.event_queries) == 1
    sql = compiled.event_queries[0].sql
    assert f"pam.events_{PROJECT_ID}" in sql
    assert "GROUP BY user_id" in sql
    assert "HAVING count()" in sql
    assert compiled.event_queries[0].params["project_id"] == PROJECT_ID
    assert compiled.event_queries[0].params["event_name"] == "purchase_completed"


def test_event_filter_with_where_clause():
    rule = _rule(
        [
            {
                "type": "event",
                "event_name": "purchase_completed",
                "where": {"currency": {"op": "eq", "value": "USD"}},
                "frequency": {"op": "gte", "count": 1},
                "time_window": {"last_days": 30},
            }
        ]
    )
    compiled = compile_rule(rule, PROJECT_ID, {"currency": "currency"})
    sql = compiled.event_queries[0].sql
    assert "currency" in sql
    assert "properties[" not in sql


def test_trait_filter_produces_mongo_pipeline():
    rule = _rule([{"type": "trait", "trait": "plan", "op": "eq", "value": "pro"}])
    compiled = compile_rule(rule, PROJECT_ID, {})

    assert len(compiled.trait_queries) == 1
    pipeline = compiled.trait_queries[0].pipeline
    assert pipeline[0]["$match"]["project_id"] == PROJECT_ID
    assert pipeline[0]["$match"]["traits.plan"] == {"$eq": "pro"}


def test_did_not_do_filter_produces_anti_join_sql():
    rule = _rule(
        [{"type": "did_not_do", "event_name": "app_opened", "time_window": {"last_days": 7}}]
    )
    compiled = compile_rule(rule, PROJECT_ID, {})

    assert len(compiled.did_not_do_queries) == 1
    sql = compiled.did_not_do_queries[0].sql
    assert "NOT IN" in sql
    assert "app_opened" not in sql  # param, not inline
    assert compiled.did_not_do_queries[0].params["event_name"] == "app_opened"


def test_in_segment_filter_stored_as_segment_id():
    rule = _rule([{"type": "in_segment", "segment_id": "seg_buyers"}])
    compiled = compile_rule(rule, PROJECT_ID, {})

    assert compiled.in_segment_ids == ["seg_buyers"]


def test_match_preserved():
    rule = SegmentRule.model_validate(
        {
            "version": 1,
            "match": "any",
            "filters": [{"type": "trait", "trait": "plan", "op": "eq", "value": "pro"}],
        }
    )
    compiled = compile_rule(rule, PROJECT_ID, {})
    assert compiled.match == "any"


def test_multiple_filters_all_compiled():
    rule = _rule(
        [
            {
                "type": "event",
                "event_name": "purchase_completed",
                "frequency": {"op": "gte", "count": 1},
                "time_window": {"last_days": 30},
            },
            {"type": "trait", "trait": "plan", "op": "eq", "value": "pro"},
            {"type": "in_segment", "segment_id": "seg_vip"},
        ]
    )
    compiled = compile_rule(rule, PROJECT_ID, {})

    assert len(compiled.event_queries) == 1
    assert len(compiled.trait_queries) == 1
    assert compiled.in_segment_ids == ["seg_vip"]
