from __future__ import annotations

from typing import Any

import structlog
from redis.asyncio import Redis

from app.bonus_event_processor.bonus_release_handler import handle_bonus_release
from app.bonus_event_processor.chunk_release_handler import handle_chunk_release
from app.models.bonus_release_trigger import TriggerWithConfigResponse
from app.services.bonus_release_trigger_service import get_triggers_with_config_by_site
from shared.clients.mysql import POOL_BONUS, get_connection
from shared.services.user import get_or_create_pam_user

log = structlog.get_logger()


async def _dispatch(
    redis: Redis,
    conn: Any,
    pam_user_id: int,
    props: dict[str, Any],
    trigger: TriggerWithConfigResponse,
) -> None:
    """Route trigger to the correct handler based on release_type."""
    if trigger.release_type == "BONUS_RELEASE":
        await handle_bonus_release(redis, conn, pam_user_id, props, trigger)
    elif trigger.release_type == "CHUNK_RELEASE":
        await handle_chunk_release(conn, pam_user_id, props, trigger)
    else:
        log.warning(
            "bonus_unknown_release_type",
            release_type=trigger.release_type,
            trigger_id=trigger.id,
        )


async def process_bonus_event(redis: Redis, event: dict[str, Any]) -> None:
    """Process a single bonus event.

    1. Extract site_id and event_name from the envelope.
    2. Resolve the external player user_id to an internal pam_user_id.
    3. Load all active release triggers for the site (Redis-first, DB fallback).
    4. Filter to triggers whose trigger_type matches the event name.
    5. Open one DB connection and dispatch each matched trigger to its handler.
    """
    event_name: str = (event.get("event_name") or "").upper()
    player_user_id: str | None = event.get("user_id")
    project_id = event.get("project_id")

    try:
        site_id = int(project_id)
    except (TypeError, ValueError):
        log.warning(
            "bonus_event_invalid_site_id",
            project_id=project_id,
            event_name=event_name,
            player_user_id=player_user_id,
        )
        return

    if not event_name or not player_user_id:
        log.warning(
            "bonus_event_missing_fields",
            event_name=event_name,
            player_user_id=player_user_id,
            site_id=site_id,
        )
        return

    pam_user_id: int = await get_or_create_pam_user(redis, site_id, player_user_id)

    all_triggers = await get_triggers_with_config_by_site(redis, site_id)

    matching = [t for t in all_triggers if t.trigger_type.upper() == event_name and t.active]

    if not matching:
        log.debug("bonus_no_matching_triggers", event_name=event_name, site_id=site_id)
        return

    props: dict[str, Any] = event.get("properties") or {}

    log.info(
        "bonus_event_received",
        event_name=event_name,
        player_user_id=player_user_id,
        pam_user_id=pam_user_id,
        site_id=site_id,
        matching_triggers=len(matching),
    )

    async with get_connection(POOL_BONUS) as conn:
        for trigger in matching:
            try:
                await _dispatch(redis, conn, pam_user_id, props, trigger)
            except Exception as exc:
                log.error(
                    "bonus_trigger_dispatch_failed",
                    trigger_id=trigger.id,
                    release_type=trigger.release_type,
                    pam_user_id=pam_user_id,
                    error=str(exc),
                )
                raise
