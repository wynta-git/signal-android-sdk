from uuid import uuid4

import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import settings
from app.dependencies import PortalAuthDep
from shared.clients.s3 import build_public_url, upload_object

log = structlog.get_logger()
router = APIRouter(prefix="/projects/{project_id}/uploads", tags=["uploads"])

_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
_DEFAULT_EXT = "png"


@router.post("/image", status_code=201)
async def upload_image(
    ctx: PortalAuthDep,
    file: UploadFile = File(...),
) -> dict:
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Only PNG, JPEG, WEBP, or GIF images are supported",
        )

    raw = await file.read()
    if len(raw) > settings.image_upload_max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds {settings.image_upload_max_bytes // 1_048_576} MB limit",
        )

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else _DEFAULT_EXT
    key = f"{ctx.project_id}/{uuid4().hex}.{ext}"

    try:
        await upload_object(
            bucket=settings.s3_bucket,
            key=key,
            body=raw,
            content_type=file.content_type,
            region=settings.s3_region,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
            endpoint_url=settings.s3_endpoint_url,
        )
    except Exception as exc:
        log.error("image_upload_failed", project_id=ctx.project_id, error=str(exc))
        raise HTTPException(status_code=503, detail="Image upload failed")

    image_url = build_public_url(bucket=settings.s3_bucket, region=settings.s3_region, key=key)
    log.info("image_uploaded", project_id=ctx.project_id, key=key)
    return {"image_url": image_url}
