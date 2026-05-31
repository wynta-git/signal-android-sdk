from typing import Any

from fastapi import APIRouter, Depends, Request

from app.dependencies import PortalAuthDep

router = APIRouter(prefix="/api/v1/segments/meta", tags=["meta"])


def _ch(request: Request):
    return request.app.state.ch


def _db(request: Request):
    return request.app.state.db


def _redis(request: Request):
    return request.app.state.redis


def _meta(request: Request):
    return request.app.state.meta


@router.get("/events")
async def list_events(
    ctx: PortalAuthDep,
    ch=Depends(_ch),
    redis=Depends(_redis),
    meta=Depends(_meta),
) -> list[str]:
    return await meta.get_events(ctx.project_id, ch, redis)


@router.get("/events/{event_name}/properties")
async def list_event_properties(
    ctx: PortalAuthDep,
    event_name: str,
    ch=Depends(_ch),
    redis=Depends(_redis),
    db=Depends(_db),
    meta=Depends(_meta),
) -> list[str]:
    return await meta.get_event_properties(ctx.project_id, event_name, ch, redis, db)


@router.get("/events/{event_name}/properties/{prop_name}/operators")
async def get_property_operators(
    ctx: PortalAuthDep,
    event_name: str,
    prop_name: str,
    ch=Depends(_ch),
    redis=Depends(_redis),
    db=Depends(_db),
    meta=Depends(_meta),
) -> dict[str, Any]:
    return await meta.get_property_operators(ctx.project_id, event_name, prop_name, ch, redis, db)


@router.get("/traits")
async def list_traits(
    ctx: PortalAuthDep,
    db=Depends(_db),
    redis=Depends(_redis),
    meta=Depends(_meta),
) -> list[str]:
    return await meta.get_traits(ctx.project_id, db, redis)


@router.get("/operators")
async def list_operators(
    ctx: PortalAuthDep,
    meta=Depends(_meta),
) -> dict[str, Any]:
    return meta.get_operators()
