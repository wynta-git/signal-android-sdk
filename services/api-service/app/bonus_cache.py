import asyncio

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

log = structlog.get_logger()


class BonusEventCache:
    """In-memory set of event type names classified as bonus.

    Populated from MongoDB on startup and refreshed periodically so the
    hot path (is_bonus) never touches the database.
    """

    def __init__(self) -> None:
        self._types: frozenset[str] = frozenset()
        self._refresh_task: asyncio.Task | None = None

    async def load(self, db: AsyncIOMotorDatabase, collection: str) -> None:
        """Replace the in-memory set from the database. Safe to call concurrently —
        frozenset assignment is atomic in CPython."""
        cursor = db[collection].find({}, {"event_type": 1, "_id": 0})
        docs = await cursor.to_list(length=None)
        new_types = frozenset(d["event_type"] for d in docs if "event_type" in d)
        self._types = new_types
        log.info("bonus_cache_loaded", count=len(new_types))

    def is_bonus(self, event_type: str) -> bool:
        return event_type in self._types

    async def start_refresh_loop(
        self,
        db: AsyncIOMotorDatabase,
        collection: str,
        interval_hours: float,
    ) -> None:
        """Start a background task that reloads the cache every interval_hours."""
        self._refresh_task = asyncio.create_task(
            self._refresh_loop(db, collection, interval_hours),
            name="bonus_cache_refresh",
        )

    async def stop(self) -> None:
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass

    async def _refresh_loop(
        self,
        db: AsyncIOMotorDatabase,
        collection: str,
        interval_hours: float,
    ) -> None:
        interval_seconds = interval_hours * 3600
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                await self.load(db, collection)
            except Exception:
                log.warning("bonus_cache_refresh_failed", exc_info=True)
