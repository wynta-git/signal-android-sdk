from typing import Any

import structlog

log = structlog.get_logger()


async def process_bonus_event(event: dict[str, Any]) -> None:
    """Process a single bonus event. Bonus release logic to be implemented here."""
    log.info(
        "bonus_event_received",
        event_name=event.get("event_name"),
        user_id=event.get("user_id"),
        site_id=event.get("project_id"),
    )
