import secrets
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.dependencies import AdminDep, EVENT_ROUTE_MAP_KEY
from shared.auth.token import hash_token, token_cache_key, token_revoke_key
from shared.clients.mongo import (
    admin_create_event_route,
    admin_create_token,
    admin_delete_event_route,
    admin_delete_user,
    admin_get_event_route,
    admin_get_project,
    admin_get_user,
    admin_list_tokens,
    admin_revoke_token,
    admin_update_project_settings,
    list_field_aliases,
    load_event_routes,
    merge_field_aliases,
    upsert_field_aliases,
)

log = structlog.get_logger()
router = APIRouter(prefix="/v1/admin", tags=["admin"])


def _db(request: Request):
    return request.app.state.mongo[settings.mongo_db]


def _redis(request: Request):
    return request.app.state.redis


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------


class ProjectSettingsUpdate(BaseModel):
    timezone: str | None = None
    retention_months: int | None = None


@router.get("/project")
async def get_project(ctx: AdminDep, request: Request) -> dict[str, Any]:
    doc = await admin_get_project(_db(request), ctx.project_id)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Project not found"},
        )
    return doc


@router.patch("/project")
async def update_project(
    body: ProjectSettingsUpdate,
    ctx: AdminDep,
    request: Request,
) -> dict[str, Any]:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=400,
            detail={"code": "no_fields", "message": "No fields to update"},
        )
    ok = await admin_update_project_settings(_db(request), ctx.project_id, updates)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Project not found"},
        )
    doc = await admin_get_project(_db(request), ctx.project_id)
    return doc or {}


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------


class CreateTokenRequest(BaseModel):
    scope: list[str]
    env: str = "live"
    label: str | None = None


@router.post("/tokens", status_code=201)
async def create_token(
    body: CreateTokenRequest,
    ctx: AdminDep,
    request: Request,
) -> dict[str, Any]:
    if body.env not in ("live", "test"):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_env", "message": "env must be 'live' or 'test'"},
        )
    raw = f"pam_{body.env}_{secrets.token_urlsafe(24)}"
    now = datetime.now(timezone.utc)
    doc = {
        "project_id": ctx.project_id,
        "token_hash": hash_token(raw),
        "scope": body.scope,
        "status": "active",
        "label": body.label,
        "created_at": now,
        "last_used_at": None,
        "revoked_at": None,
    }
    token_id = await admin_create_token(_db(request), doc)
    log.info("admin.token.created", project_id=ctx.project_id, token_id=token_id, scope=body.scope)
    return {
        "token_id": token_id,
        "token": raw,
        "scope": body.scope,
        "env": body.env,
        "label": body.label,
        "created_at": now.isoformat(),
    }


@router.get("/tokens")
async def list_tokens(ctx: AdminDep, request: Request) -> list[dict[str, Any]]:
    return await admin_list_tokens(_db(request), ctx.project_id)


@router.delete("/tokens/{token_id}", status_code=200)
async def revoke_token(
    token_id: str,
    ctx: AdminDep,
    request: Request,
) -> dict[str, Any]:
    doc = await admin_revoke_token(_db(request), ctx.project_id, token_id)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Token not found or already revoked"},
        )
    pipe = _redis(request).pipeline()
    pipe.delete(token_cache_key(doc["token_hash"]))
    pipe.set(token_revoke_key(doc["token_hash"]), "1", ex=3600)
    await pipe.execute()
    log.info("admin.token.revoked", project_id=ctx.project_id, token_id=token_id)
    return {"token_id": token_id, "status": "revoked"}


# ---------------------------------------------------------------------------
# Event Routes
# ---------------------------------------------------------------------------


class CreateEventRouteRequest(BaseModel):
    topic: str
    event_names: list[str]


@router.get("/event-routes")
async def list_event_routes(ctx: AdminDep, request: Request) -> list[dict[str, Any]]:
    return await load_event_routes(_db(request))


@router.post("/event-routes", status_code=201)
async def create_event_route(
    body: CreateEventRouteRequest,
    ctx: AdminDep,
    request: Request,
) -> dict[str, Any]:
    existing = await admin_get_event_route(_db(request), body.topic)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "conflict", "message": "Route for this topic already exists"},
        )
    await admin_create_event_route(_db(request), {"topic": body.topic, "event_names": body.event_names})
    await _redis(request).delete(EVENT_ROUTE_MAP_KEY)
    log.info("admin.event_route.created", topic=body.topic, project_id=ctx.project_id)
    return {"topic": body.topic, "event_names": body.event_names}


@router.delete("/event-routes/{topic}", status_code=200)
async def delete_event_route(
    topic: str,
    ctx: AdminDep,
    request: Request,
) -> dict[str, Any]:
    ok = await admin_delete_event_route(_db(request), topic)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Event route not found"},
        )
    await _redis(request).delete(EVENT_ROUTE_MAP_KEY)
    log.info("admin.event_route.deleted", topic=topic, project_id=ctx.project_id)
    return {"topic": topic, "deleted": True}


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.get("/users/{user_id}")
async def get_user(user_id: str, ctx: AdminDep, request: Request) -> dict[str, Any]:
    doc = await admin_get_user(_db(request), ctx.project_id, user_id)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "User not found"},
        )
    return doc


@router.delete("/users/{user_id}", status_code=200)
async def delete_user(
    user_id: str, ctx: AdminDep, request: Request
) -> dict[str, Any]:
    ok = await admin_delete_user(_db(request), ctx.project_id, user_id)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "User not found"},
        )
    log.info("admin.user.deleted", project_id=ctx.project_id, user_id=user_id)
    return {"user_id": user_id, "deleted": True}


# ---------------------------------------------------------------------------
# Field Aliases
# ---------------------------------------------------------------------------


class FieldAliasesRequest(BaseModel):
    aliases: dict[str, str]


@router.get("/field-aliases")
async def list_field_aliases_route(
    ctx: AdminDep, request: Request
) -> list[dict[str, Any]]:
    return await list_field_aliases(_db(request), ctx.project_id)


@router.post("/field-aliases/{event_name}", status_code=200)
async def upsert_field_aliases_route(
    event_name: str,
    body: FieldAliasesRequest,
    ctx: AdminDep,
    request: Request,
) -> dict[str, Any]:
    await upsert_field_aliases(_db(request), ctx.project_id, event_name, body.aliases)
    await _redis(request).delete(f"meta:{ctx.project_id}:event_props:{event_name}")
    log.info("admin.field_aliases.upserted", project_id=ctx.project_id, event_name=event_name)
    return {"event_name": event_name, "aliases": body.aliases}


@router.patch("/field-aliases/{event_name}", status_code=200)
async def merge_field_aliases_route(
    event_name: str,
    body: FieldAliasesRequest,
    ctx: AdminDep,
    request: Request,
) -> dict[str, Any]:
    updated = await merge_field_aliases(_db(request), ctx.project_id, event_name, body.aliases)
    await _redis(request).delete(f"meta:{ctx.project_id}:event_props:{event_name}")
    log.info("admin.field_aliases.merged", project_id=ctx.project_id, event_name=event_name)
    return {"event_name": event_name, "aliases": updated}
