import uuid

import aiomysql
import structlog
from aiomysql import IntegrityError
from redis.asyncio import Redis

from shared.clients.mysql import POOL_COMMON, get_connection
from shared.clients.redis import get_str, set_with_ttl
from shared.services.client import get_active_site_ids_by_program, get_program_id_by_key

log = structlog.get_logger(__name__)

_PROVISIONED_TTL = 3600  # 1 hour — self-heals if the row is ever deleted underneath
_ROLE_ID_TTL = 21600  # 6 hours — role.code is documented as "never rename"
_DEFAULT_ROLE_CODE = "ANALYST"
_AUTO_PROVISION_ACTOR = "portal-auto-provision"

_SQL_GET_ROLE_ID = "SELECT id FROM role WHERE code = %s AND active = 1 LIMIT 1"

_SQL_GET_SYSTEM_USER = "SELECT id FROM system_user WHERE external_id = %s LIMIT 1"
_SQL_INSERT_SYSTEM_USER = """
    INSERT INTO system_user (external_id, email, display_name, program_id, active, created_by, updated_by)
    VALUES (%s, %s, %s, %s, 1, %s, %s)
"""

_SQL_GET_USER_SITE_ROLE = "SELECT id FROM user_site_role WHERE user_id = %s AND site_id = %s LIMIT 1"
_SQL_INSERT_USER_SITE_ROLE = """
    INSERT INTO user_site_role (user_id, site_id, role_id, active, created_by, updated_by)
    VALUES (%s, %s, %s, 1, %s, %s)
"""

SETTING_TYPE_UI = "UI"

_CHAT_E2EE_KEY_SETTING = "chat_e2ee_key"

_SQL_GET_SYSTEM_USER_SETTING = (
    "SELECT id FROM system_user_setting WHERE system_user_id = %s AND config_key = %s AND active = 1 LIMIT 1"
)
_SQL_INSERT_SYSTEM_USER_SETTING = """
    INSERT INTO system_user_setting (system_user_id, type, config_key, config_value, active, created_by, updated_by)
    VALUES (%s, %s, %s, %s, 1, %s, %s)
"""


def settings_cache_key(system_user_id: int) -> str:
    return f"auth:sys_user_settings:{system_user_id}"


def _provisioned_cache_key(program_key: str, external_id: str) -> str:
    return f"auth:sys_user:provisioned:{program_key}:{external_id}"


def _role_id_cache_key(code: str) -> str:
    return f"auth:role:code_id:{code}"


async def _get_role_id_by_code(code: str, redis: Redis) -> int | None:
    key = _role_id_cache_key(code)
    cached = await get_str(redis, key)
    if cached is not None:
        return int(cached)

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_GET_ROLE_ID, (code,))
            row = await cur.fetchone()

    if row is None:
        return None

    await set_with_ttl(redis, key, str(row[0]), _ROLE_ID_TTL)
    return int(row[0])


async def _get_or_create_system_user_id(
    external_id: str,
    email: str,
    display_name: str,
    program_id: int | None,
    conn: aiomysql.Connection,
) -> int:
    """Idempotent check-then-insert; tolerates a concurrent-request race on the
    UNIQUE(external_id) constraint by re-SELECTing on IntegrityError."""
    async with conn.cursor() as cur:
        await cur.execute(_SQL_GET_SYSTEM_USER, (external_id,))
        row = await cur.fetchone()
        if row is not None:
            return int(row[0])

        try:
            await cur.execute(
                _SQL_INSERT_SYSTEM_USER,
                (external_id, email, display_name, program_id, _AUTO_PROVISION_ACTOR, _AUTO_PROVISION_ACTOR),
            )
            await conn.commit()
            return int(cur.lastrowid)
        except IntegrityError:
            await conn.rollback()
            await cur.execute(_SQL_GET_SYSTEM_USER, (external_id,))
            row = await cur.fetchone()
            if row is None:
                raise
            return int(row[0])


async def _ensure_user_site_role(
    user_id: int, site_id: int, role_id: int, conn: aiomysql.Connection
) -> None:
    """Idempotent check-then-insert; tolerates a concurrent-request race on the
    UNIQUE(user_id, site_id) constraint by rolling back and treating it as a no-op."""
    async with conn.cursor() as cur:
        await cur.execute(_SQL_GET_USER_SITE_ROLE, (user_id, site_id))
        if await cur.fetchone() is not None:
            return

        try:
            await cur.execute(
                _SQL_INSERT_USER_SITE_ROLE,
                (user_id, site_id, role_id, _AUTO_PROVISION_ACTOR, _AUTO_PROVISION_ACTOR),
            )
            await conn.commit()
        except IntegrityError:
            await conn.rollback()


async def _ensure_chat_e2ee_key(user_id: int, conn: aiomysql.Connection, redis: Redis) -> None:
    """Idempotent check-then-insert; tolerates a concurrent-request race on the
    UNIQUE(system_user_id, config_key) constraint by treating it as a no-op.
    Invalidates the settings cache on a real insert so a settings response
    cached before this key existed can't keep hiding it until its TTL expires."""
    async with conn.cursor() as cur:
        await cur.execute(_SQL_GET_SYSTEM_USER_SETTING, (user_id, _CHAT_E2EE_KEY_SETTING))
        if await cur.fetchone() is not None:
            return

        try:
            await cur.execute(
                _SQL_INSERT_SYSTEM_USER_SETTING,
                (
                    user_id, SETTING_TYPE_UI, _CHAT_E2EE_KEY_SETTING, str(uuid.uuid4()),
                    _AUTO_PROVISION_ACTOR, _AUTO_PROVISION_ACTOR,
                ),
            )
            await conn.commit()
        except IntegrityError:
            await conn.rollback()
            return

    await redis.delete(settings_cache_key(user_id))


async def ensure_system_user_provisioned(
    redis: Redis,
    external_id: str,
    email: str,
    program_key: str,
    default_role_code: str = _DEFAULT_ROLE_CODE,
) -> None:
    """Best-effort — never raises. Ensures external_id has a system_user row
    (display_name derived from email's local-part) and a user_site_role row
    for every active site under program_key's program.

    A provisioning failure must never break an otherwise-valid portal token, so
    every error is logged and swallowed here rather than propagated.
    """
    cache_key = _provisioned_cache_key(program_key, external_id)
    try:
        if await get_str(redis, cache_key) is not None:
            # Already fully provisioned — still self-heal chat_e2ee_key on its
            # own, independent cache so a user with a warm provisioned-cache
            # entry doesn't wait out the full _PROVISIONED_TTL to get one.
            await _ensure_chat_e2ee_key_standalone(redis, external_id)
            return

        display_name = email.split("@")[0]

        role_id = await _get_role_id_by_code(default_role_code, redis)
        if role_id is None:
            log.warning(
                "system_user.auto_provision_skipped_no_role",
                role_code=default_role_code, external_id=external_id,
            )
            return

        program_id = await get_program_id_by_key(program_key, redis)
        if program_id is None:
            log.warning(
                "system_user.auto_provision_unmapped_program_key",
                program_key=program_key, external_id=external_id,
            )

        site_ids = await get_active_site_ids_by_program(program_id, redis) if program_id else []

        async with get_connection(POOL_COMMON) as conn:
            user_id = await _get_or_create_system_user_id(
                external_id, email, display_name, program_id, conn
            )
            await _ensure_chat_e2ee_key(user_id, conn, redis)
            for site_id in site_ids:
                await _ensure_user_site_role(user_id, site_id, role_id, conn)

        await set_with_ttl(redis, cache_key, "1", _PROVISIONED_TTL)
        log.info(
            "system_user.auto_provisioned",
            external_id=external_id, program_key=program_key,
            user_id=user_id, role_id=role_id, site_count=len(site_ids),
        )
    except Exception as exc:
        log.warning(
            "system_user.auto_provision_failed",
            external_id=external_id, program_key=program_key, error=str(exc),
        )


_CHAT_KEY_ENSURED_TTL = 3600  # 1 hour — independent of _PROVISIONED_TTL


def _chat_key_ensured_cache_key(external_id: str) -> str:
    return f"auth:sys_user:chat_key_ensured:{external_id}"


async def _ensure_chat_e2ee_key_standalone(redis: Redis, external_id: str) -> None:
    """Best-effort self-heal for already-provisioned users: ensure chat_e2ee_key
    exists without waiting out ensure_system_user_provisioned's own cache TTL.
    Never raises — mirrors that function's best-effort contract."""
    try:
        chat_key_cache = _chat_key_ensured_cache_key(external_id)
        if await get_str(redis, chat_key_cache) is not None:
            return

        user_id = await get_system_user_id_by_external_id(external_id, redis)
        if user_id is None:
            return

        async with get_connection(POOL_COMMON) as conn:
            await _ensure_chat_e2ee_key(user_id, conn, redis)

        await set_with_ttl(redis, chat_key_cache, "1", _CHAT_KEY_ENSURED_TTL)
    except Exception as exc:
        log.warning(
            "system_user.chat_e2ee_key_standalone_failed",
            external_id=external_id, error=str(exc),
        )


_ID_BY_EXTERNAL_ID_TTL = 3600  # 1 hour

_SQL_ID_BY_EXTERNAL_ID = "SELECT id FROM system_user WHERE external_id = %s AND active = 1 LIMIT 1"


def _id_by_external_id_cache_key(external_id: str) -> str:
    return f"auth:sys_user:id_by_external:{external_id}"


async def get_system_user_id_by_external_id(
    external_id: str,
    redis: Redis,
    ttl: int = _ID_BY_EXTERNAL_ID_TTL,
) -> int | None:
    """Return system_user.id for an active external_id, or None if unmapped."""
    key = _id_by_external_id_cache_key(external_id)

    cached = await get_str(redis, key)
    if cached is not None:
        return int(cached)

    async with get_connection(POOL_COMMON) as conn:
        async with conn.cursor() as cur:
            await cur.execute(_SQL_ID_BY_EXTERNAL_ID, (external_id,))
            row = await cur.fetchone()

    if row is None:
        return None

    await set_with_ttl(redis, key, str(row[0]), ttl)
    return int(row[0])
