from fastapi import APIRouter

from app.models.brands import BrandResponse

router = APIRouter(prefix="/brands", tags=["brands"])

_HARDCODED_BRANDS: list[BrandResponse] = [
    BrandResponse(name="Taj Rummy", description="#1 rummy brand", site_id=1),
    BrandResponse(name="Taj Games", description="All in one game", site_id=2),
]


@router.get("", response_model=list[BrandResponse])
async def get_brands(user_id: int) -> list[BrandResponse]:
    """Return brands for the logged-in user. Hardcoded until DB is wired up."""
    return _HARDCODED_BRANDS
