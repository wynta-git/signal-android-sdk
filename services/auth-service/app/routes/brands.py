from fastapi import APIRouter, HTTPException

from app.cache import get_redis
from app.dependencies import PortalAuthDep
from app.services.brands import BrandResponse, get_active_brands
from shared.services.client import get_all_programs

router = APIRouter()


@router.get("/brands", response_model=list[BrandResponse])
async def list_brands(ctx: PortalAuthDep) -> list[BrandResponse]:
    redis = get_redis()
    projects = await get_all_programs(redis)
    project = next((p for p in projects if p.program_key == ctx.project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return await get_active_brands(project.id)


@router.get("/brands/program/{program_id}", response_model=list[BrandResponse])
async def list_brands_by_program(program_id: int) -> list[BrandResponse]:
    return await get_active_brands(program_id)
