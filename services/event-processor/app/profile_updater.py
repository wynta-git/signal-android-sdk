from datetime import datetime, timezone
from typing import Any

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from shared.clients.mongo import upsert_user_profile
from .profile_mapping import PROFILE_EVENT_MAPPING

log = structlog.get_logger()


class ProfileUpdater:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db

    async def update_from_events(self, project_id: str, events: list[dict[str, Any]]) -> None:
        for event in events:
            event_name = event.get("event_name")
            field_map = PROFILE_EVENT_MAPPING.get(event_name)  # type: ignore[arg-type]
            if not field_map:
                continue

            user_id = event.get("user_id")
            if not user_id:
                log.warning(
                    "profile_update_skipped_no_user_id",
                    project_id=project_id,
                    event_name=event_name,
                    event_id=event.get("event_id"),
                )
                continue

            props = event.get("properties") or {}
            traits: dict[str, Any] = {}
            for prop_key, profile_field in field_map.items():
                if prop_key in props:
                    traits[profile_field] = props[prop_key]
                else:
                    log.warning(
                        "profile_update_missing_property",
                        project_id=project_id,
                        event_name=event_name,
                        event_id=event.get("event_id"),
                        user_id=user_id,
                        missing_property=prop_key,
                    )

            if not traits:
                continue

            try:
                await upsert_user_profile(
                    self._db,
                    project_id=project_id,
                    user_id=user_id,
                    traits=traits,
                    anonymous_id=None,
                    unset_traits=[],
                    now=datetime.now(timezone.utc),
                )
                log.info(
                    "profile_updated_from_event",
                    project_id=project_id,
                    event_name=event_name,
                    user_id=user_id,
                    fields=list(traits.keys()),
                )
            except Exception:
                log.exception(
                    "profile_update_failed",
                    project_id=project_id,
                    event_name=event_name,
                    user_id=user_id,
                )
