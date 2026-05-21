from typing import Any

from fastapi import APIRouter, Depends, Request

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
    project_id: str,
    ch=Depends(_ch),
    redis=Depends(_redis),
    meta=Depends(_meta),
) -> list[str]:
    return await meta.get_events(project_id, ch, redis)


@router.get("/events/{event_name}/properties")
async def list_event_properties(
    project_id: str,
    event_name: str,
    ch=Depends(_ch),
    redis=Depends(_redis),
    db=Depends(_db),
    meta=Depends(_meta),
) -> list[str]:
    return await meta.get_event_properties(project_id, event_name, ch, redis, db)


@router.get("/traits")
async def list_traits(
    project_id: str,
    db=Depends(_db),
    redis=Depends(_redis),
    meta=Depends(_meta),
) -> list[str]:
    return await meta.get_traits(project_id, db, redis)


@router.get("/operators")
async def list_operators(meta=Depends(_meta)) -> dict[str, Any]:
    return meta.get_operators()
