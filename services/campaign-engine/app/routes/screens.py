from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis
from shared.clients.mongo import (
    delete_screen_catalog_entry,
    list_screen_catalog_entries,
    upsert_screen_catalog_entry,
)

from app.dependencies import PortalAuthDep, get_db, get_redis
from app.models import CreateScreenRequest
from app.screens import get_cached_screen_catalog

router = APIRouter(prefix="/projects/{project_id}/screens", tags=["screens"])

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]


def _cache_key(project_id: str, brand_id: str | None) -> str:
    return f"pam:screens:{project_id}:{brand_id or 'all'}"


@router.get("")
async def list_screens(
    ctx: PortalAuthDep,
    db: DbDep,
    redis: RedisDep,
    brand_id: str | None = None,
) -> dict:
    screens = await get_cached_screen_catalog(db, redis, ctx.project_id, brand_id)
    return {"screens": screens}


@router.get("/detailed")
async def list_screens_detailed(
    ctx: PortalAuthDep,
    db: DbDep,
    brand_id: str | None = None,
) -> dict[str, Any]:
    """Full catalog entries (name + scope), for the Screen Catalog admin
    page — unlike the cached, deduplicated `GET ""` the wizard's autocomplete
    uses, this always reads live so add/edit/delete show up immediately."""
    screens = await list_screen_catalog_entries(db, ctx.project_id, brand_id)
    return {"screens": screens}


@router.post("")
async def create_screen(
    body: CreateScreenRequest,
    ctx: PortalAuthDep,
    db: DbDep,
    redis: RedisDep,
) -> dict[str, Any]:
    await upsert_screen_catalog_entry(db, ctx.project_id, body.screen_name, body.brand_id)
    await redis.delete(_cache_key(ctx.project_id, body.brand_id))
    screens = await get_cached_screen_catalog(db, redis, ctx.project_id, body.brand_id)
    return {"screens": screens}


@router.delete("/{screen_name}")
async def delete_screen(
    screen_name: str,
    ctx: PortalAuthDep,
    db: DbDep,
    redis: RedisDep,
    brand_id: str | None = None,
) -> dict[str, Any]:
    deleted = await delete_screen_catalog_entry(db, ctx.project_id, screen_name, brand_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="screen not found")
    await redis.delete(_cache_key(ctx.project_id, brand_id))
    screens = await get_cached_screen_catalog(db, redis, ctx.project_id, brand_id)
    return {"screens": screens}
