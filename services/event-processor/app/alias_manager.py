import time
from typing import Any

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from shared.clients.mongo import get_field_aliases

log = structlog.get_logger()

_CACHE_TTL = 30.0  # seconds


class AliasManager:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db
        # (project_id, event_name) -> (aliases_dict, loaded_at_monotonic)
        self._cache: dict[tuple[str, str], tuple[dict[str, str], float]] = {}

    async def _load(self, project_id: str, event_name: str) -> dict[str, str]:
        key = (project_id, event_name)
        entry = self._cache.get(key)
        if entry and time.monotonic() - entry[1] < _CACHE_TTL:
            return entry[0]
        aliases = await get_field_aliases(self._db, project_id, event_name)
        self._cache[key] = (aliases, time.monotonic())
        if aliases:
            log.debug("alias_cache_loaded", project_id=project_id, event_name=event_name, count=len(aliases))
        return aliases

    async def resolve(
        self,
        project_id: str,
        event_name: str,
        props: dict[str, Any],
    ) -> dict[str, Any]:
        """Return props with source field names replaced by their canonical names.

        Alias wins on conflict: if both source and canonical are present, the
        source value overwrites the canonical. Aliases are applied atomically
        from the original props so chained mappings (a→b, b→c) do not cascade.
        """
        aliases = await self._load(project_id, event_name)
        if not aliases:
            return props

        applicable = {src: can for src, can in aliases.items() if src in props}
        if not applicable:
            return props

        # Build result: all non-source keys preserved, then canonical values set
        # from original props (alias overwrites any pre-existing canonical value).
        result = {k: v for k, v in props.items() if k not in applicable}
        for source, canonical in applicable.items():
            result[canonical] = props[source]
        return result
