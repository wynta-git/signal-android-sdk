import json
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import PortalAuthDep, get_db
from app.models import FcmSettingsRequest
from shared.clients.mongo import admin_get_project, admin_update_project_settings

log = structlog.get_logger()
router = APIRouter(prefix="/projects/{project_id}/settings", tags=["settings"])

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]


@router.put("/fcm")
async def update_fcm_settings(
    project_id: str,
    body: FcmSettingsRequest,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict[str, Any]:
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail="project_id mismatch")

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
    project_id: str,
    ctx: PortalAuthDep,
    db: DbDep,
) -> dict[str, Any]:
    if ctx.project_id != project_id:
        raise HTTPException(status_code=403, detail="project_id mismatch")

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
