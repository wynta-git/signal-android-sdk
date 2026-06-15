from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.dependencies import PortalAuthDep
from app.exceptions import (
    BonusConfigureDuplicateError,
    BonusConfigureNotFoundError,
    BonusConfigureValidationError,
    DatabaseError,
)
from app.models.bonus_configure import (
    BonusConfigureCreate,
    BonusConfigureDetail,
    BonusConfigureResponse,
    BonusConfigureUpdate,
)
from app.models.bonus_head import BudgetPeriod, LimitsUpsertRequest
from app.services.bonus_configure_service import (
    add_bonus_configure,
    get_bonus_configure,
    list_bonus_configures_by_subhead,
    update_bonus_configure,
    upsert_limits,
)
from app.services.history_service import get_configure_history

router = APIRouter(prefix="/bonus-configures", tags=["bonus-configures"])


@router.post("", response_model=BonusConfigureResponse, status_code=201)
async def create_bonus_configure(payload: BonusConfigureCreate, ctx: PortalAuthDep) -> BonusConfigureResponse:
    """
    Create a new bonus configure node under an existing subhead.

    A default promo code (``AUTO-{id}``) is automatically created alongside the
    configure row and can be updated later via the bonus-configure-codes API.

    - **subhead_id**: parent bonus_subhead id
    - **site_id**: positive integer identifying the site
    - **name**: unique within the subhead (1–100 chars)
    - **start_date / end_date**: active date window (end ≥ start)
    - **applicability_frequency**: ``EVERYTIME`` (default), ``ONCE``, ``MONTHLY``, or ``WEEKLY``
    - **wager_multiplier**: 0 = no wagering required
    - **no_of_chunks**: number of equal chunks (default 1)
    - **created_by**: actor performing the creation
    """
    payload.created_by = ctx.user_id
    return await add_bonus_configure(payload)


@router.get("", response_model=list[BonusConfigureResponse])
async def list_bonus_configures(subhead_id: int) -> list[BonusConfigureResponse]:
    """List all configure nodes for a given subhead, ordered by priority then id."""
    return await list_bonus_configures_by_subhead(subhead_id)


@router.get("/{configure_id}", response_model=BonusConfigureDetail)
async def get_bonus_configure_detail(configure_id: int) -> BonusConfigureDetail:
    """Return a configure node with all its attached promo codes."""
    return await get_bonus_configure(configure_id)


@router.patch("/{configure_id}", response_model=BonusConfigureResponse)
async def patch_bonus_configure(
    configure_id: int, payload: BonusConfigureUpdate, ctx: PortalAuthDep
) -> BonusConfigureResponse:
    """
    Partially update a bonus configure node.

    Only fields included in the request body are written. ``updated_by`` is always
    required. Send ``"description": null`` to explicitly clear the description.
    """
    payload.updated_by = ctx.user_id
    return await update_bonus_configure(configure_id, payload)


@router.put("/{configure_id}/limits", response_model=list[BudgetPeriod])
async def put_bonus_configure_limits(
    configure_id: int, payload: LimitsUpsertRequest, ctx: PortalAuthDep
) -> list[BudgetPeriod]:
    """
    Set or update budget caps for a bonus configure.

    Each entry is upserted on period_type. Returns all budget periods after the operation.
    """
    payload.updated_by = ctx.user_id
    return await upsert_limits(configure_id, payload)


@router.get("/{configure_id}/history")
async def get_bonus_configure_history(configure_id: int) -> list[dict]:
    """Return the change history for a bonus configure."""
    return await get_configure_history(configure_id)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

def register_exception_handlers(app: "FastAPI") -> None:  # type: ignore[name-defined]  # noqa: F821
    from fastapi import FastAPI  # local import to avoid circular
    from fastapi import Request

    @app.exception_handler(BonusConfigureValidationError)
    async def handle_validation(request: Request, exc: BonusConfigureValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": [{"field": exc.field, "message": exc.message}]},
        )

    @app.exception_handler(BonusConfigureNotFoundError)
    async def handle_not_found(request: Request, exc: BonusConfigureNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(BonusConfigureDuplicateError)
    async def handle_duplicate(request: Request, exc: BonusConfigureDuplicateError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})
