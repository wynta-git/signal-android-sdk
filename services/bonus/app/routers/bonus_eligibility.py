from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.exceptions import (
    BonusEligibilityDuplicateError,
    BonusEligibilityNotFoundError,
    BonusEligibilityValidationError,
    DatabaseError,
)
from app.models.bonus_eligibility import (
    BonusEligibilityCreate,
    BonusEligibilityResponse,
    BonusEligibilityUpdate,
)
from app.services.bonus_eligibility_service import (
    add_bonus_eligibility,
    get_bonus_eligibility,
    update_bonus_eligibility,
)

router = APIRouter(prefix="/bonus-eligibilities", tags=["bonus-eligibilities"])


@router.post("", response_model=BonusEligibilityResponse, status_code=201)
async def create_bonus_eligibility(
    payload: BonusEligibilityCreate,
) -> BonusEligibilityResponse:
    """
    Create one eligibility criterion for a bonus configure node.

    Each row is a single key-value rule. To require multiple criteria on the
    same configure, POST multiple rows — all active rows must pass (AND).

    - **configure_id**: parent bonus_configure id
    - **site_id**: positive integer identifying the site
    - **eligibility_key**: criterion name (e.g. ``player_registered_period``,
      ``player_type``, ``kyc_status``, ``min_lifetime_deposits``)
    - **eligibility_value**: criterion value as a string
    - **eligibility_value_type**: ``STRING`` | ``INT`` | ``DECIMAL`` | ``BOOLEAN`` | ``JSON``
    - **description**: human-readable summary of this criterion (optional)
    - **created_by**: actor performing the creation
    """
    return await add_bonus_eligibility(payload)


@router.get("/{eligibility_id}", response_model=BonusEligibilityResponse)
async def get_bonus_eligibility_detail(
    eligibility_id: int,
) -> BonusEligibilityResponse:
    """Return a single eligibility criterion row."""
    return await get_bonus_eligibility(eligibility_id)


@router.patch("/{eligibility_id}", response_model=BonusEligibilityResponse)
async def patch_bonus_eligibility(
    eligibility_id: int,
    payload: BonusEligibilityUpdate,
) -> BonusEligibilityResponse:
    """
    Partially update an eligibility criterion row.

    Only fields included in the request body are written.
    ``updated_by`` is always required.
    """
    return await update_bonus_eligibility(eligibility_id, payload)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


def register_exception_handlers(app: "FastAPI") -> None:  # type: ignore[name-defined]  # noqa: F821
    from fastapi import FastAPI, Request

    @app.exception_handler(BonusEligibilityValidationError)
    async def handle_validation(
        request: Request, exc: BonusEligibilityValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": [{"field": exc.field, "message": exc.message}]},
        )

    @app.exception_handler(BonusEligibilityDuplicateError)
    async def handle_duplicate(
        request: Request, exc: BonusEligibilityDuplicateError
    ) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(BonusEligibilityNotFoundError)
    async def handle_not_found(
        request: Request, exc: BonusEligibilityNotFoundError
    ) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(DatabaseError)
    async def handle_db_error(
        request: Request, exc: DatabaseError
    ) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "internal database error"})
