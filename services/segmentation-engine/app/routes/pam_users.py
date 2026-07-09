from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.dependencies import PortalAuthDep

log = structlog.get_logger()

router = APIRouter(prefix="/users", tags=["users"])


def _ch(request: Request):
    return request.app.state.ch


_EVENT_COLUMNS = (
    "event_id", "event_name", "timestamp", "session_id",
    "amount", "currency", "platform", "device_type",
)

# ClickHouse bookkeeping columns never surfaced as raw event data.
_HIDDEN_COLUMNS = frozenset({"insert_date", "created_at"})


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat() + "Z"
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


@router.get("/{user_id}/events")
async def list_user_events(
    ctx: PortalAuthDep,
    user_id: str,
    ch=Depends(_ch),
    limit: int = Query(20, ge=1, le=100),
    before: str | None = Query(None),
    brand_id: str | None = Query(None),
) -> dict[str, Any]:
    table = f"pam.events_{ctx.project_id}"

    where = ["user_id = {user_id:String}"]
    parameters: dict[str, Any] = {"user_id": user_id, "limit": limit + 1}
    if brand_id:
        where.append("brand_id = {brand_id:String}")
        parameters["brand_id"] = brand_id
    if before:
        try:
            cursor = datetime.fromisoformat(before.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "invalid_cursor",
                    "message": "`before` must be an ISO-8601 timestamp",
                },
            ) from None
        parameters["before"] = cursor.replace(tzinfo=None)
        where.append("timestamp < {before:DateTime64(3)}")

    columns: list[str] = []
    try:
        result = await ch.query(
            f"SELECT * FROM {table}"
            f" WHERE {' AND '.join(where)}"
            " ORDER BY timestamp DESC"
            " LIMIT {limit:UInt32}",
            parameters=parameters,
        )
        rows = result.result_rows
        columns = list(result.column_names)
    except Exception as exc:
        log.warning(
            "pam_users.fetch_events_failed",
            project_id=ctx.project_id, user_id=user_id, error=str(exc),
        )
        rows = []

    has_more = len(rows) > limit
    rows = rows[:limit]

    events = []
    for row in rows:
        full = {c: _json_safe(v) for c, v in zip(columns, row, strict=False)}
        event = {c: full.get(c) for c in _EVENT_COLUMNS}
        # Everything else (dynamic property columns + remaining envelope fields)
        # is surfaced as the raw event payload.
        event["properties"] = {
            k: v for k, v in full.items()
            if k not in _EVENT_COLUMNS and k not in _HIDDEN_COLUMNS
            and v is not None and v != ""
        }
        events.append(event)

    return {
        "user_id": user_id,
        "events": events,
        "has_more": has_more,
        "next_cursor": events[-1]["timestamp"] if has_more and events else None,
    }
