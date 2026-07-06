"""Tests for history_service._row_to_entries — pure function, no DB needed."""

import json
from datetime import datetime

from app.services.history_service import _row_to_entries

_NOW = datetime(2026, 5, 12, 10, 0, 0)


def _row(table_name, action, old_vals, new_vals):
    return (
        1,
        table_name,
        action,
        "priya.sharma",
        _NOW,
        json.dumps(old_vals) if old_vals else None,
        json.dumps(new_vals) if new_vals else None,
    )


def test_multi_field_update_groups_into_single_entry() -> None:
    row = _row(
        "bonus_head",
        "UPDATE",
        {"name": "Old Name", "description": "Old desc"},
        {"name": "New Name", "description": "New desc"},
    )

    entries = _row_to_entries(row)

    assert len(entries) == 1
    assert entries[0]["kind"] == "UPDATED"
    assert entries[0]["summary"] == "Updated head"
    assert entries[0]["changes"] == [
        {"field": "name", "old": "Old Name", "new": "New Name"},
        {"field": "description", "old": "Old desc", "new": "New desc"},
    ]


def test_single_field_update_still_uses_changes_list() -> None:
    row = _row("bonus_subhead", "UPDATE", {"owner": "old.owner"}, {"owner": "new.owner"})

    entries = _row_to_entries(row)

    assert len(entries) == 1
    assert entries[0]["changes"] == [{"field": "owner", "old": "old.owner", "new": "new.owner"}]


def test_activation_change_alone_has_no_changes_key() -> None:
    row = _row("bonus_head", "UPDATE", {"active": 1}, {"active": 0})

    entries = _row_to_entries(row)

    assert len(entries) == 1
    assert entries[0]["kind"] == "DEACTIVATED"
    assert "changes" not in entries[0]


def test_activation_and_field_change_together_group_into_one_entry() -> None:
    row = _row(
        "bonus_head",
        "UPDATE",
        {"active": 0, "name": "Old Name"},
        {"active": 1, "name": "New Name"},
    )

    entries = _row_to_entries(row)

    assert len(entries) == 1
    assert entries[0]["kind"] == "ACTIVATED"
    assert entries[0]["changes"] == [{"field": "name", "old": "Old Name", "new": "New Name"}]


def test_owner_role_change_uses_changes_list() -> None:
    row = _row(
        "bonus_head_owner",
        "UPDATE",
        {"username": "sneha.ops", "role": "OPS_LEAD"},
        {"username": "sneha.ops", "role": "CAMPAIGN_MANAGER"},
    )

    entries = _row_to_entries(row)

    assert len(entries) == 1
    assert entries[0]["kind"] == "OWNER_UPDATED"
    assert entries[0]["changes"] == [
        {"field": "role", "old": "OPS_LEAD", "new": "CAMPAIGN_MANAGER"}
    ]
