import structlog
from fastapi import APIRouter

from app.dependencies import PortalAuthDep
from app.exceptions import DatabaseError
from shared.clients.mysql import POOL_COMMON, get_connection

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/site-configure", tags=["site-configure"])

_SITE_CONFIGURE_SQL = """
    SELECT config_key, config_value
    FROM site_configure
    WHERE site_id = %s AND active = 1
"""


@router.get("", response_model=dict[str, str])
async def get_site_configure(site_id: int, ctx: PortalAuthDep) -> dict[str, str]:
    """Return every active site_configure row for a site as {config_key: config_value}."""
    log.info("get_site_configure.start", site_id=site_id)
    try:
        async with get_connection(POOL_COMMON) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SITE_CONFIGURE_SQL, (site_id,))
                rows = await cur.fetchall()
    except Exception as exc:
        log.error("get_site_configure.db_error", site_id=site_id, error=str(exc))
        raise DatabaseError(str(exc)) from exc

    return {config_key: config_value for config_key, config_value in rows}
