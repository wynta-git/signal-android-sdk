import uuid
from datetime import datetime, timezone
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import AuthDep, get_db
from app.models import CreateTemplateRequest, UpdateTemplateRequest
from motor.motor_asyncio import AsyncIOMotorDatabase
from shared.clients.mongo import (
    delete_template,
    get_template,
    insert_template,
    list_templates,
    update_template,
)

log = structlog.get_logger()
router = APIRouter(prefix="/v1/projects/{project_id}/templates", tags=["templates"])

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]


@router.post("", status_code=201)
async def create_template(
    ctx: AuthDep,
    body: CreateTemplateRequest,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    template_id = f"tmpl_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    doc = {
        "template_id": template_id,
        "project_id": project_id,
        "name": body.name,
        "channel": body.channel,
        "body": body.body,
        "created_at": now,
        "updated_at": now,
    }
    await insert_template(db, doc)
    log.info("template.created", project_id=project_id, template_id=template_id)
    return {"template_id": template_id}


@router.get("")
async def list_templates_route(ctx: AuthDep, db: DbDep) -> list[dict]:
    return await list_templates(db, ctx.project_id)


@router.get("/{template_id}")
async def get_template_route(ctx: AuthDep, template_id: str, db: DbDep) -> dict:
    doc = await get_template(db, ctx.project_id, template_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    return doc


@router.patch("/{template_id}")
async def update_template_route(
    ctx: AuthDep,
    template_id: str,
    body: UpdateTemplateRequest,
    db: DbDep,
) -> dict:
    project_id = ctx.project_id
    doc = await get_template(db, project_id, template_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return doc

    await update_template(db, project_id, template_id, updates)
    updated = await get_template(db, project_id, template_id)
    return updated or {}


@router.delete("/{template_id}", status_code=204)
async def delete_template_route(
    ctx: AuthDep,
    template_id: str,
    db: DbDep,
) -> None:
    doc = await get_template(db, ctx.project_id, template_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    await delete_template(db, ctx.project_id, template_id)
