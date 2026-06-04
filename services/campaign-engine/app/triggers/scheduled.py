from datetime import date, datetime, timezone
from typing import Any


def is_within_window(campaign_doc: dict[str, Any], now: datetime) -> bool:
    """Return False if now is outside the campaign's start_date/end_date window.

    Called by the scheduler before firing a scheduled campaign run.
    Both dates are inclusive and interpreted as UTC day boundaries.
    """
    schedule = (campaign_doc.get("trigger") or {}).get("schedule") or {}

    start_str = schedule.get("start_date")
    end_str = schedule.get("end_date")

    today_utc = now.astimezone(timezone.utc).date()

    if start_str and today_utc < date.fromisoformat(start_str):
        return False

    if end_str and today_utc > date.fromisoformat(end_str):
        return False

    return True
