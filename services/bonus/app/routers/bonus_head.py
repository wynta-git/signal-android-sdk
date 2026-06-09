from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.exceptions import (
    BonusHeadDuplicateError,
    BonusHeadNotFoundError,
    BonusHeadValidationError,
    DatabaseError,
)
from app.models.bonus_head import (
    BonusHeadCreate,
    BonusHeadDetail,
    BonusHeadResponse,
    BonusHeadUpdate,
    BudgetPeriod,
    LimitsUpsertRequest,
    OwnerEntry,
    OwnersUpsertRequest,
)
from app.services.bonus_head_service import (
    add_bonus_head,
    get_bonus_head,
    list_bonus_heads,
    update_bonus_head,
    upsert_limits,
    upsert_owners,
)
from app.services.history_service import get_head_history

router = APIRouter(prefix="/bonus-heads", tags=["bonus-heads"])


@router.get("", response_model=list[BonusHeadResponse])
async def list_bonus_heads_endpoint(site_id: int) -> list[BonusHeadResponse]:
    """Return all bonus heads for a site."""
    return await list_bonus_heads(site_id)


@router.get("/{head_id}", response_model=BonusHeadDetail)
async def get_bonus_head_detail(head_id: int) -> BonusHeadDetail:
    """
    Return a bonus head with its owners, subheads (categories), and budget
    (configured limits and current period usage for DAILY / WEEKLY / MONTHLY).
    """
    return await get_bonus_head(head_id)


@router.patch("/{head_id}", response_model=BonusHeadResponse)
async def patch_bonus_head(head_id: int, payload: BonusHeadUpdate) -> BonusHeadResponse:
    """
    Partially update a bonus head.

    Only fields included in the request body are written. `updated_by` is always required.
    Send `"description": null` to explicitly clear the description.
    """
    return await update_bonus_head(head_id, payload)


@router.put("/{head_id}/owners", response_model=list[OwnerEntry])
async def put_bonus_head_owners(
    head_id: int, payload: OwnersUpsertRequest
) -> list[OwnerEntry]:
    """
    Add or update owner assignments for a bonus head.

    Each entry is upserted on username — role, active, and updated_by are
    overwritten on conflict. Returns all current owners after the operation.
    """
    return await upsert_owners(head_id, payload)


@router.put("/{head_id}/limits", response_model=list[BudgetPeriod])
async def put_bonus_head_limits(
    head_id: int, payload: LimitsUpsertRequest
) -> list[BudgetPeriod]:
    """
    Set or update budget caps for a bonus head.

    Each entry is upserted on period_type — budget_limit is overwritten on conflict.
    Pass `null` for budget_limit to mark a period as uncapped.
    Returns all budget periods (with current usage) after the operation.
    """
    return await upsert_limits(head_id, payload)


@router.get("/{head_id}/history")
async def get_bonus_head_history(head_id: int) -> list[dict]:
    """Return the change history for a bonus head, including budget updates."""
    return await get_head_history(head_id)


@router.post("", response_model=BonusHeadResponse, status_code=201)
async def create_bonus_head(payload: BonusHeadCreate) -> BonusHeadResponse:
    """
    Create a new bonus head.

    - **site_id**: positive integer identifying the site
    - **name**: unique within the site (1–100 chars, alphanumeric + space/hyphen/underscore/dot)
    - **description**: optional free-text (max 500 chars)
    - **active**: defaults to `true`
    - **owner**: primary accountable person (username or email)
    - **created_by**: actor performing the creation
    """
    return await add_bonus_head(payload)


# ---------------------------------------------------------------------------
# Exception handlers registered on the router level (applied in main.py)
# ---------------------------------------------------------------------------

def register_exception_handlers(app: "FastAPI") -> None:  # type: ignore[name-defined]  # noqa: F821
    from fastapi import FastAPI  # local import to avoid circular
    from fastapi import Request

    @app.exception_handler(BonusHeadValidationError)
    async def handle_validation(request: Request, exc: BonusHeadValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": [{"field": exc.field, "message": exc.message}]},
        )

    @app.exception_handler(BonusHeadNotFoundError)
    async def handle_not_found(request: Request, exc: BonusHeadNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(BonusHeadDuplicateError)
    async def handle_duplicate(request: Request, exc: BonusHeadDuplicateError) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"detail": str(exc)},
        )

    @app.exception_handler(DatabaseError)
    async def handle_db_error(request: Request, exc: DatabaseError) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"detail": "A database error occurred"},
        )

    @app.exception_handler(ValidationError)
    async def handle_pydantic(request: Request, exc: ValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors(include_url=False)},
        )
