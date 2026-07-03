import asyncio
import concurrent.futures
import json
from datetime import datetime, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import PortalAuthDep, get_db
from app.models import BrandFcmSettingsRequest, FcmSettingsRequest
from shared.clients.mongo import (
    admin_get_project,
    admin_update_project_settings,
    get_brand_fcm_settings,
    upsert_brand_fcm_credential,
)

_fcm_verify_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=2, thread_name_prefix="fcm-verify"
)

log = structlog.get_logger()
router = APIRouter(prefix="/projects/{project_id}/settings", tags=["settings"])

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]


@router.put("/fcm")
async def update_fcm_settings(
    body: FcmSettingsRequest,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict[str, Any]:
    project_id = ctx.project_id
    found = await admin_update_project_settings(db, project_id, {
        "fcm_server_key": body.server_key,
        "fcm_sender_id": body.sender_id,
        "fcm_service_account_json": json.dumps(body.service_account_json),
    })
    if not found:
        raise HTTPException(status_code=404, detail="project not found")

    log.info("fcm_settings.updated", project_id=project_id)
    return {"ok": True}


@router.get("/fcm")
async def get_fcm_settings(
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict[str, Any]:
    project_id = ctx.project_id
    project = await admin_get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="project not found")

    s = project.get("settings") or {}
    sa_json: dict[str, Any] | None = None
    sa_json_str = s.get("fcm_service_account_json")
    if sa_json_str:
        try:
            parsed = json.loads(sa_json_str)
            # mask private key before returning to UI
            sa_json = {**parsed, "private_key": "***", "private_key_id": "***"}
        except (json.JSONDecodeError, TypeError):
            pass

    return {
        "server_key": s.get("fcm_server_key", ""),
        "sender_id": s.get("fcm_sender_id", ""),
        "service_account_json": sa_json,
    }


@router.put("/fcm/brands/{brand_id}")
async def update_brand_fcm_settings(
    brand_id: str,
    body: BrandFcmSettingsRequest,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict[str, Any]:
    project_id = ctx.project_id
    await upsert_brand_fcm_credential(
        db,
        project_id=project_id,
        brand_id=brand_id,
        fcm_service_account_json=json.dumps(body.service_account_json),
        now=datetime.now(timezone.utc),
    )
    log.info("brand_fcm_settings.updated", project_id=project_id, brand_id=brand_id)
    return {"ok": True}


@router.get("/fcm/brands/{brand_id}")
async def get_brand_fcm_settings_route(
    brand_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict[str, Any]:
    project_id = ctx.project_id
    doc = await get_brand_fcm_settings(db, project_id, brand_id)
    if not doc:
        raise HTTPException(status_code=404, detail="brand FCM settings not found")

    sa_json: dict[str, Any] | None = None
    sa_json_str = doc.get("fcm_service_account_json")
    if sa_json_str:
        try:
            parsed = json.loads(sa_json_str)
            sa_json = {**parsed, "private_key": "***", "private_key_id": "***"}
        except (json.JSONDecodeError, TypeError):
            pass

    return {"brand_id": brand_id, "service_account_json": sa_json}


@router.post("/fcm/verify")
async def verify_fcm_credentials(
    body: BrandFcmSettingsRequest,
    ctx: PortalAuthDep,
) -> dict[str, Any]:
    """Test FCM service-account JSON by obtaining an OAuth2 token from Google."""
    from google.auth.transport.requests import Request as GoogleRequest  # noqa: PLC0415
    from google.oauth2 import service_account  # noqa: PLC0415

    credential_json = json.dumps(body.service_account_json)
    firebase_project_id = body.service_account_json.get("project_id", "unknown")

    def _refresh() -> None:
        cred_dict = json.loads(credential_json)
        creds = service_account.Credentials.from_service_account_info(
            cred_dict,
            scopes=["https://www.googleapis.com/auth/firebase.messaging"],
        )
        creds.refresh(GoogleRequest())

    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(_fcm_verify_executor, _refresh)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    log.info("fcm_credentials.verified", project_id=ctx.project_id, firebase_project=firebase_project_id)
    return {"ok": True, "message": f"Connected to Firebase project '{firebase_project_id}'"}


@router.delete("/fcm/brands/{brand_id}")
async def delete_brand_fcm_settings(
    brand_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict[str, Any]:
    project_id = ctx.project_id
    await db["brand_settings"].delete_one({"project_id": project_id, "brand_id": brand_id})
    log.info("brand_fcm_settings.deleted", project_id=project_id, brand_id=brand_id)
    return {"ok": True}
