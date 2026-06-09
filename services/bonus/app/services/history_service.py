import json
from datetime import datetime

import structlog

from shared.clients.mysql import get_connection

log = structlog.get_logger(__name__)

_HEAD_HISTORY_SQL = """
    SELECT id, table_name, action, changed_by, changed_at, old_values, new_values
    FROM bonus_change_log
    WHERE (table_name = 'bonus_head'        AND entity_id = %s)
       OR (table_name = 'bonus_head_budget' AND entity_id = %s)
    ORDER BY changed_at DESC, id DESC
    LIMIT 200
"""

_SUBHEAD_HISTORY_SQL = """
    SELECT id, table_name, action, changed_by, changed_at, old_values, new_values
    FROM bonus_change_log
    WHERE (table_name = 'bonus_subhead'        AND entity_id = %s)
       OR (table_name = 'bonus_subhead_budget' AND entity_id = %s)
    ORDER BY changed_at DESC, id DESC
    LIMIT 200
"""

_CONFIGURE_HISTORY_SQL = """
    SELECT id, table_name, action, changed_by, changed_at, old_values, new_values
    FROM bonus_change_log
    WHERE table_name = 'bonus_configure' AND entity_id = %s
    ORDER BY changed_at DESC, id DESC
    LIMIT 200
"""


def _at(dt: object) -> str:
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


def _row_to_entries(row: tuple) -> list[dict]:
    """Transform one audit_log row into 0..N frontend HistoryEntry dicts."""
    _, table_name, action, changed_by, changed_at, old_json, new_json = row
    old_vals: dict = json.loads(old_json) if old_json else {}
    new_vals: dict = json.loads(new_json) if new_json else {}
    at = _at(changed_at)

    if table_name in ("bonus_head", "bonus_subhead", "bonus_configure"):
        if table_name == "bonus_configure":
            entity_label = "configure"
        elif table_name == "bonus_head":
            entity_label = "head"
        else:
            entity_label = "subhead"
        if action == "INSERT":
            return [
                {
                    "kind": "CREATED",
                    "actor": changed_by,
                    "at": at,
                    "summary": f"Created {entity_label}",
                    "newValue": str(new_vals.get("name", "")),
                }
            ]

        entries: list[dict] = []
        if "active" in old_vals:
            prev = int(old_vals["active"])
            if prev == 0:
                entries.append(
                    {"kind": "ACTIVATED", "actor": changed_by, "at": at,
                     "summary": f"Activated {entity_label}"}
                )
            else:
                entries.append(
                    {"kind": "DEACTIVATED", "actor": changed_by, "at": at,
                     "summary": f"Paused {entity_label}"}
                )
        for field in ("name", "description", "owner"):
            if field in old_vals:
                entries.append(
                    {
                        "kind": "UPDATED",
                        "actor": changed_by,
                        "at": at,
                        "summary": f"Updated {field}",
                        "field": field,
                        "old": str(old_vals[field]),
                        "new": str(new_vals.get(field, "")),
                    }
                )
        return entries or [
            {"kind": "UPDATED", "actor": changed_by, "at": at, "summary": f"Updated {entity_label}"}
        ]

    if table_name in ("bonus_head_budget", "bonus_subhead_budget"):
        period = new_vals.get("period_type", "PERIOD")
        new_limit = new_vals.get("budget_limit")
        old_limit = old_vals.get("budget_limit")
        field = f"budget.{period}.limit"

        if new_limit is None:
            entry: dict = {
                "kind": "BUDGET_UPDATED", "actor": changed_by, "at": at,
                "summary": f"Removed {period} budget cap", "field": field,
            }
            if old_limit is not None:
                entry.update({"old": str(old_limit), "new": "∞"})
        elif old_limit is not None:
            entry = {
                "kind": "BUDGET_UPDATED", "actor": changed_by, "at": at,
                "summary": f"Updated {period} budget limit", "field": field,
                "old": str(old_limit), "new": str(new_limit),
            }
        else:
            entry = {
                "kind": "BUDGET_UPDATED", "actor": changed_by, "at": at,
                "summary": f"Set {period} budget limit", "field": field,
                "newValue": str(new_limit),
            }
        return [entry]

    return []


async def get_head_history(head_id: int) -> list[dict]:
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await conn.commit()
                await cur.execute(_HEAD_HISTORY_SQL, (head_id, head_id))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("get_head_history.db_error", head_id=head_id, error=str(exc))
        return []

    entries: list[dict] = []
    for row in rows:
        entries.extend(_row_to_entries(row))
    return entries


async def get_configure_history(configure_id: int) -> list[dict]:
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await conn.commit()
                await cur.execute(_CONFIGURE_HISTORY_SQL, (configure_id,))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("get_configure_history.db_error", configure_id=configure_id, error=str(exc))
        return []

    entries: list[dict] = []
    for row in rows:
        entries.extend(_row_to_entries(row))
    return entries


async def get_subhead_history(subhead_id: int) -> list[dict]:
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await conn.commit()
                await cur.execute(_SUBHEAD_HISTORY_SQL, (subhead_id, subhead_id))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("get_subhead_history.db_error", subhead_id=subhead_id, error=str(exc))
        return []

    entries: list[dict] = []
    for row in rows:
        entries.extend(_row_to_entries(row))
    return entries
