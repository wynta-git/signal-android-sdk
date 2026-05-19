import structlog
import httpx

from app.config import settings

log = structlog.get_logger()


async def trigger_segment_refresh(project_id: str, segment_id: str) -> None:
    url = (
        f"{settings.segmentation_engine_url}"
        f"/v1/admin/projects/{project_id}/segments/{segment_id}/evaluate"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url)
            resp.raise_for_status()
        log.info(
            "prefetch.segment_refresh_queued",
            project_id=project_id,
            segment_id=segment_id,
        )
    except Exception:
        log.warning(
            "prefetch.segment_refresh_failed",
            project_id=project_id,
            segment_id=segment_id,
            segmentation_url=url,
        )
