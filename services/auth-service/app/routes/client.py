from fastapi import APIRouter

from app.services.client import ClientResponse, get_client_details, get_clients_by_site

router = APIRouter()


@router.get("/clients", response_model=list[ClientResponse])
async def list_clients(site_id: int) -> list[ClientResponse]:
    return await get_clients_by_site(site_id)


@router.get("/client", response_model=ClientResponse)
async def get_client(client_id: str) -> ClientResponse:
    return await get_client_details(client_id)
