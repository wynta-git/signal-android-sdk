from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.dependencies import PortalAuthDep
from app.exceptions import (
    BonusCodeNotFoundError,
    BonusReleaseTriggerDuplicateError,
    BonusReleaseTriggerNotFoundError,
    BonusReleaseTriggerValidationError,
    DatabaseError,
)
from app.models.bonus_release_trigger import (
    BonusReleaseTriggerCreate,
    BonusReleaseTriggerResponse,
    BonusReleaseTriggerUpdate,
)
from app.services.bonus_release_trigger_service import (
    add_bonus_release_trigger,
    delete_bonus_release_trigger,
    get_bonus_release_trigger,
    update_bonus_release_trigger,
)

router = APIRouter(prefix="/bonus-release-triggers", tags=["bonus-release-triggers"])


@router.post("", response_model=BonusReleaseTriggerResponse, status_code=201)
async def create_bonus_release_trigger(
    payload: BonusReleaseTriggerCreate,
    ctx: PortalAuthDep,
) -> BonusReleaseTriggerResponse:
    """
    Create a release trigger for a bonus configure, resolved via promo code.

    The ``code`` field (e.g. ``FIRST_DEPOSIT``) is looked up in
    ``bonus_configure_code`` to determine the parent ``configure_id``.
    The combination of ``(configure_id, trigger_type)`` must be unique.

    - **code**: promo code that resolves to the parent bonus_configure
    - **site_id**: positive integer identifying the site
    - **trigger_type**: see ``TriggerType`` in ``models/bonus_release_trigger.py`` for the full canonical list
    - **occurrence**: ``0`` = every event, ``1`` = first only, ``N`` = Nth occurrence
    - **min_trigger_amount / max_trigger_amount**: qualifying amount window (both optional)
    - **payment_method**: restrict to a payment method, e.g. ``UPI`` (optional)
    - **product**: restrict to a product, e.g. ``CASINO`` (optional)
    - **trigger_config**: free-form JSON for additional conditions (optional)
    - **created_by**: actor performing the creation
    """
    payload.created_by = ctx.user_id
    return await add_bonus_release_trigger(payload)


@router.get("/{trigger_id}", response_model=BonusReleaseTriggerResponse)
async def get_bonus_release_trigger_detail(
    trigger_id: int,
) -> BonusReleaseTriggerResponse:
    """Return a single release trigger by id."""
    return await get_bonus_release_trigger(trigger_id)


@router.patch("/{trigger_id}", response_model=BonusReleaseTriggerResponse)
async def patch_bonus_release_trigger(
    trigger_id: int, payload: BonusReleaseTriggerUpdate, ctx: PortalAuthDep
) -> BonusReleaseTriggerResponse:
    """
    Partially update a release trigger.

    Only fields included in the request body are written. ``updated_by`` is always
    required. To update ``trigger_config``, send the full replacement object.
    """
    payload.updated_by = ctx.user_id
    return await update_bonus_release_trigger(trigger_id, payload)


@router.delete("/{trigger_id}", status_code=204)
async def delete_bonus_release_trigger_endpoint(trigger_id: int) -> None:
    """Hard-delete a release trigger."""
    await delete_bonus_release_trigger(trigger_id)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

def register_exception_handlers(app: "FastAPI") -> None:  # type: ignore[name-defined]  # noqa: F821
    from fastapi import FastAPI, Request

    @app.exception_handler(BonusReleaseTriggerValidationError)
    async def handle_validation(
        request: Request, exc: BonusReleaseTriggerValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": [{"field": exc.field, "message": exc.message}]},
        )

    @app.exception_handler(BonusCodeNotFoundError)
    async def handle_code_not_found(
        request: Request, exc: BonusCodeNotFoundError
    ) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(BonusReleaseTriggerNotFoundError)
    async def handle_not_found(
        request: Request, exc: BonusReleaseTriggerNotFoundError
    ) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(BonusReleaseTriggerDuplicateError)
    async def handle_duplicate(
        request: Request, exc: BonusReleaseTriggerDuplicateError
    ) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})
