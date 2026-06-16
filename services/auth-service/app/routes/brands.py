from fastapi import APIRouter

from app.services.brands import BrandResponse, get_active_brands

router = APIRouter()


@router.get("/brands", response_model=list[BrandResponse])
async def list_brands(program_id: int) -> list[BrandResponse]:
    return await get_active_brands(program_id)


@router.get("/brands/program/{program_id}", response_model=list[BrandResponse])
async def list_brands_by_program(program_id: int) -> list[BrandResponse]:
    return await get_active_brands(program_id)
