from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.exceptions import (
    BonusEligibilityKeyNotFoundError,
    BonusEligibilityNotFoundError,
    BonusEligibilityValidationError,
    DatabaseError,
)
from app.models.bonus_eligibility import (
    BonusEligibilityCreate,
    BonusEligibilityResponse,
    BonusEligibilityUpdate,
    EligibilityKeyCreate,
    EligibilityKeyResponse,
    EligibilityKeyUpdate,
)
from app.services.bonus_eligibility_service import (
    add_bonus_eligibility,
    add_eligibility_key,
    delete_eligibility_key,
    get_bonus_eligibility,
    update_bonus_eligibility,
    update_eligibility_key,
)

router = APIRouter(prefix="/bonus-eligibilities", tags=["bonus-eligibilities"])


# ---------------------------------------------------------------------------
# bonus_eligibility header endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=BonusEligibilityResponse, status_code=201)
async def create_bonus_eligibility(
    payload: BonusEligibilityCreate,
) -> BonusEligibilityResponse:
    """
    Create a bonus eligibility rule set for a configure node.

    Optionally supply ``keys`` in the body to create criteria in the same
    request. Each key represents one eligibility condition (e.g.
    ``player_type``, ``kyc_status``, ``min_lifetime_deposits``).

    - **configure_id**: parent bonus_configure id
    - **site_id**: positive integer identifying the site
    - **description**: human-readable summary of this rule set (optional)
    - **keys**: list of ``{eligibility_key, eligibility_value, eligibility_value_type}``
    - **created_by**: actor performing the creation
    """
    return await add_bonus_eligibility(payload)


@router.get("/{eligibility_id}", response_model=BonusEligibilityResponse)
async def get_bonus_eligibility_detail(
    eligibility_id: int,
) -> BonusEligibilityResponse:
    """Return a single eligibility rule set with all its key-value criteria."""
    return await get_bonus_eligibility(eligibility_id)


@router.patch("/{eligibility_id}", response_model=BonusEligibilityResponse)
async def patch_bonus_eligibility(
    eligibility_id: int,
    payload: BonusEligibilityUpdate,
) -> BonusEligibilityResponse:
    """
    Partially update the bonus_eligibility header row.

    Only ``description`` and ``active`` can be patched here.
    To modify criteria use the ``/keys`` sub-resource.
    ``updated_by`` is always required.
    """
    return await update_bonus_eligibility(eligibility_id, payload)


# ---------------------------------------------------------------------------
# bonus_eligibility_key sub-resource endpoints
# ---------------------------------------------------------------------------


@router.post("/{eligibility_id}/keys", response_model=EligibilityKeyResponse, status_code=201)
async def create_eligibility_key(
    eligibility_id: int,
    payload: EligibilityKeyCreate,
) -> EligibilityKeyResponse:
    """
    Add a key-value criterion to an existing eligibility rule set.

    - **eligibility_key**: criterion name (e.g. ``player_type``, ``kyc_status``,
      ``min_lifetime_deposits``, ``player_tag``)
    - **eligibility_value**: criterion value as a string
    - **eligibility_value_type**: ``STRING`` | ``INT`` | ``DECIMAL`` | ``BOOLEAN`` | ``JSON``
    """
    return await add_eligibility_key(eligibility_id, payload)


@router.patch("/{eligibility_id}/keys/{key_id}", response_model=EligibilityKeyResponse)
async def patch_eligibility_key(
    eligibility_id: int,
    key_id: int,
    payload: EligibilityKeyUpdate,
    updated_by: str = Query(..., min_length=1, max_length=100),
) -> EligibilityKeyResponse:
    """
    Partially update a single key-value criterion.

    All fields are optional. ``updated_by`` is required as a query parameter.
    """
    return await update_eligibility_key(key_id, payload, updated_by)


@router.delete("/{eligibility_id}/keys/{key_id}", status_code=204)
async def remove_eligibility_key(
    eligibility_id: int,
    key_id: int,
    deleted_by: str = Query(..., min_length=1, max_length=100),
) -> None:
    """Remove a key-value criterion from the eligibility rule set."""
    await delete_eligibility_key(key_id, deleted_by)


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

    @app.exception_handler(BonusEligibilityNotFoundError)
    async def handle_eligibility_not_found(
        request: Request, exc: BonusEligibilityNotFoundError
    ) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(BonusEligibilityKeyNotFoundError)
    async def handle_key_not_found(
        request: Request, exc: BonusEligibilityKeyNotFoundError
    ) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(DatabaseError)
    async def handle_db_error(
        request: Request, exc: DatabaseError
    ) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "internal database error"})
