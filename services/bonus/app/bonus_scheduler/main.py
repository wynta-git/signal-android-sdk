from __future__ import annotations

import asyncio
import logging
import logging.handlers
import os
import signal

import structlog

from app.config import settings
from app.db import close_pool, init_pool
from app.bonus_scheduler.chunk_expiry_job import run_chunk_expiry_job
from app.bonus_scheduler.bonus_forfeit_job import run_bonus_forfeit_job


def _configure_logging() -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    handlers: list[logging.Handler] = [logging.StreamHandler()]

    if settings.log_dir:
        os.makedirs(settings.log_dir, exist_ok=True)
        log_path = os.path.join(settings.log_dir, "bonus-scheduler.log")
        file_handler = logging.handlers.RotatingFileHandler(
            log_path,
            maxBytes=50 * 1024 * 1024,
            backupCount=7,
            encoding="utf-8",
        )
        handlers.append(file_handler)

    logging.basicConfig(level=level, handlers=handlers, force=True)


_configure_logging()

log = structlog.get_logger()


async def main() -> None:
    log.info(
        "bonus_scheduler.starting",
        interval_minutes=settings.scheduler_interval_minutes,
        batch_size=settings.scheduler_batch_size,
    )

    await init_pool()
    log.info("bonus_scheduler.db_pool_ready")

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _on_signal(sig: signal.Signals) -> None:
        log.info("shutdown_signal_received", signal=sig.name)
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: _on_signal(s))

    log.info("bonus_scheduler.started")

    while not stop_event.is_set():
        try:
            await asyncio.gather(
                run_chunk_expiry_job(settings.scheduler_batch_size),
                run_bonus_forfeit_job(settings.scheduler_batch_size),
            )
        except Exception:
            log.exception("bonus_scheduler.job_error")

        interval_s = settings.scheduler_interval_minutes * 60
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_s)
        except asyncio.TimeoutError:
            pass  # Normal wake-up: run jobs again

    log.info("bonus_scheduler.stopped")
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
