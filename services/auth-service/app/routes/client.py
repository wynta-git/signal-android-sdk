from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.cache import get_redis
from app.config import settings
from app.dependencies import PortalAuthDep
from app.services.client_mgmt import create_client, delete_client
from shared.services.client import ClientResponse, get_client_details, get_clients_by_site

router = APIRouter()

_VALID_CLIENT_TYPES = {"APK", "IOS", "WEB", "S2S"}


class CreateClientRequest(BaseModel):
    site_id: int
    client_id: str | None = None
    name: str
    description: str | None = None
    client_type: str


class CreateClientResponse(BaseModel):
    client_id: str
    client_secret: str
    site_id: int
    name: str
    description: str | None
    client_type: str
    role: dict
    created_by: str


@router.get("/clients", response_model=list[ClientResponse])
async def list_clients(site_id: int) -> list[ClientResponse]:
    return await get_clients_by_site(site_id, get_redis(), settings.redis_cache_ttl)


@router.get("/client", response_model=ClientResponse)
async def get_client(client_id: str) -> ClientResponse:
    return await get_client_details(client_id, get_redis(), settings.redis_cache_ttl)


@router.post("/clients", response_model=CreateClientResponse, status_code=201)
async def create_client_endpoint(body: CreateClientRequest, ctx: PortalAuthDep) -> CreateClientResponse:
    if body.client_type not in _VALID_CLIENT_TYPES:
        raise HTTPException(status_code=422, detail=f"client_type must be one of {sorted(_VALID_CLIENT_TYPES)}")
    raw_secret, record = await create_client(
        site_id=body.site_id,
        client_id=body.client_id.strip() if body.client_id else None,
        name=body.name.strip(),
        description=body.description,
        client_type=body.client_type,
        created_by=ctx.user_id or ctx.service,
        redis=get_redis(),
    )
    return CreateClientResponse(
        client_id=record["client_id"],
        client_secret=raw_secret,
        site_id=record["site_id"],
        name=record["name"],
        description=record["description"],
        client_type=record["client_type"],
        role=record["role"],
        created_by=record["created_by"],
    )


@router.delete("/clients/{client_id}", status_code=204)
async def delete_client_endpoint(client_id: str, ctx: PortalAuthDep) -> None:
    await delete_client(client_id, get_redis())
