from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class BrandResponse(BaseModel):
    name: str
    description: str
    site_id: int


_BRANDS: list[BrandResponse] = [
    BrandResponse(name="Taj Rummy", description="#1 rummy brand", site_id=1),
    BrandResponse(name="Taj Games", description="All in one game", site_id=2),
]


@router.get("/brands", response_model=list[BrandResponse])
async def list_brands(user_id: int) -> list[BrandResponse]:
    """Return brands available to the logged-in user."""
    return _BRANDS
