from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.dependencies import PortalAuthDep
from app.exceptions import (
    BonusSubheadDuplicateError,
    BonusSubheadNotFoundError,
    BonusSubheadValidationError,
    DatabaseError,
)
from app.models.bonus_head import BudgetPeriod, LimitsUpsertRequest, OwnerEntry, OwnersUpsertRequest
from app.models.bonus_subhead import (
    BonusSubheadCreate,
    BonusSubheadDetail,
    BonusSubheadResponse,
    BonusSubheadUpdate,
)
from app.services.bonus_subhead_service import (
    add_bonus_subhead,
    get_bonus_subhead,
    update_bonus_subhead,
    upsert_limits,
    upsert_owners,
)
from app.services.history_service import get_subhead_history

router = APIRouter(prefix="/bonus-subheads", tags=["bonus-subheads"])


@router.post("", response_model=BonusSubheadResponse, status_code=201)
async def create_bonus_subhead(payload: BonusSubheadCreate, ctx: PortalAuthDep) -> BonusSubheadResponse:
    """
    Create a new bonus subhead under an existing bonus head.

    - **head_id**: parent bonus_head id
    - **site_id**: positive integer identifying the site
    - **name**: unique within the parent head (1–100 chars)
    - **description**: optional free-text (max 500 chars)
    - **active**: defaults to `true`
    - **owner**: primary accountable person (username or email)
    - **created_by**: actor performing the creation
    """
    payload.created_by = ctx.username
    return await add_bonus_subhead(payload)


@router.get("/{subhead_id}", response_model=BonusSubheadDetail)
async def get_bonus_subhead_detail(subhead_id: int) -> BonusSubheadDetail:
    """Return a bonus subhead with its owners and budget (limits + current period usage)."""
    return await get_bonus_subhead(subhead_id)


@router.patch("/{subhead_id}", response_model=BonusSubheadResponse)
async def patch_bonus_subhead(subhead_id: int, payload: BonusSubheadUpdate, ctx: PortalAuthDep) -> BonusSubheadResponse:
    """
    Partially update a bonus subhead.

    Only fields included in the request body are written. `updated_by` is always required.
    Send `"description": null` to explicitly clear the description.
    """
    payload.updated_by = ctx.username
    return await update_bonus_subhead(subhead_id, payload)


@router.put("/{subhead_id}/owners", response_model=list[OwnerEntry])
async def put_bonus_subhead_owners(
    subhead_id: int, payload: OwnersUpsertRequest, ctx: PortalAuthDep
) -> list[OwnerEntry]:
    """
    Add or update owner assignments for a bonus subhead.

    Each entry is upserted on username. Returns all current owners after the operation.
    """
    payload.updated_by = ctx.username
    return await upsert_owners(subhead_id, payload)


@router.get("/{subhead_id}/history")
async def get_bonus_subhead_history(subhead_id: int) -> list[dict]:
    """Return the change history for a bonus subhead, including budget updates."""
    return await get_subhead_history(subhead_id)


@router.put("/{subhead_id}/limits", response_model=list[BudgetPeriod])
async def put_bonus_subhead_limits(
    subhead_id: int, payload: LimitsUpsertRequest, ctx: PortalAuthDep
) -> list[BudgetPeriod]:
    """
    Set or update budget caps for a bonus subhead.

    Each entry is upserted on period_type. Returns all budget periods after the operation.
    """
    payload.updated_by = ctx.username
    return await upsert_limits(subhead_id, payload)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

def register_exception_handlers(app: "FastAPI") -> None:  # type: ignore[name-defined]  # noqa: F821
    from fastapi import FastAPI  # local import to avoid circular
    from fastapi import Request

    @app.exception_handler(BonusSubheadValidationError)
    async def handle_validation(request: Request, exc: BonusSubheadValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": [{"field": exc.field, "message": exc.message}]},
        )

    @app.exception_handler(BonusSubheadNotFoundError)
    async def handle_not_found(request: Request, exc: BonusSubheadNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(BonusSubheadDuplicateError)
    async def handle_duplicate(request: Request, exc: BonusSubheadDuplicateError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})
