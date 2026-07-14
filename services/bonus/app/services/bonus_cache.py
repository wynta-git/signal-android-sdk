"""
Cache invalidation helpers for bonus configuration changes.

Key patterns:
  pam:bonus:code:{code}:{chip_type}          — validate-code config cache (TTL 600 s)
  pam:bonus:eligibility:{configure_id}       — eligibility rules cache (TTL 300 s)
  pam:bonus:triggers:{site_id}:{type}        — per-trigger-type cache (TTL 300 s)
  pam:bonus:site_triggers:{site_id}          — all-triggers-for-site cache (TTL 300 s)
  pam:bonus:auto_apply_code:{configure_id}   — system-auto-apply code lookup cache (TTL 300 s)
"""

import structlog
from redis.asyncio import Redis

log = structlog.get_logger(__name__)


async def bust_code_cache(redis: Redis, codes: list[str], chip_types: list[str]) -> None:
    keys = [f"pam:bonus:code:{code}:{chip}" for code in codes for chip in chip_types]
    if keys:
        await redis.delete(*keys)
        log.info("bonus_cache.bust_code", keys=keys)


async def bust_eligibility_cache(redis: Redis, configure_id: int) -> None:
    key = f"pam:bonus:eligibility:{configure_id}"
    await redis.delete(key)
    log.info("bonus_cache.bust_eligibility", configure_id=configure_id, key=key)


async def bust_trigger_cache(redis: Redis, site_id: int) -> None:
    keys = [k async for k in redis.scan_iter(match=f"pam:bonus:triggers:{site_id}:*")]
    keys.append(f"pam:bonus:site_triggers:{site_id}")
    await redis.delete(*keys)
    log.info("bonus_cache.bust_triggers", site_id=site_id, count=len(keys))


async def bust_auto_apply_code_cache(redis: Redis, configure_id: int) -> None:
    key = f"pam:bonus:auto_apply_code:{configure_id}"
    await redis.delete(key)
    log.info("bonus_cache.bust_auto_apply_code", configure_id=configure_id, key=key)
