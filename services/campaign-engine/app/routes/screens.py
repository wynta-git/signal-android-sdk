from typing import Annotated

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from app.dependencies import PortalAuthDep, get_db, get_redis
from app.screens import get_cached_screen_catalog

router = APIRouter(prefix="/projects/{project_id}/screens", tags=["screens"])

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]


@router.get("")
async def list_screens(
    ctx: PortalAuthDep,
    db: DbDep,
    redis: RedisDep,
    brand_id: str | None = None,
) -> dict:
    screens = await get_cached_screen_catalog(db, redis, ctx.project_id, brand_id)
    return {"screens": screens}
