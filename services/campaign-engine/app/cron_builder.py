from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.models import ScheduleInput


def build_cron(schedule: ScheduleInput) -> str:
    """Convert a ScheduleInput (UI-friendly) into a UTC cron expression."""
    h, m = map(int, schedule.schedule_time.split(":"))
    tz = ZoneInfo(schedule.timezone)
    # Use a fixed mid-month reference date to avoid DST edge cases on day boundaries
    ref = datetime(2000, 1, 15, h, m, tzinfo=tz)
    utc = ref.astimezone(timezone.utc)
    utc_h, utc_m = utc.hour, utc.minute

    if schedule.type == "daily":
        return f"{utc_m} {utc_h} * * *"

    if schedule.type == "weekly":
        days = ",".join(schedule.days_of_week or ["MON"])
        return f"{utc_m} {utc_h} * * {days}"

    if schedule.type == "monthly":
        days = ",".join(str(d) for d in sorted(schedule.days_of_month or [1]))
        return f"{utc_m} {utc_h} {days} * *"

    raise ValueError(f"Unsupported schedule type: {schedule.type}")
