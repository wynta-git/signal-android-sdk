from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

# request.form() (parsed by Starlette directly, bypassing FastAPI's File(...)
# dependency injection) yields starlette.datastructures.UploadFile instances —
# fastapi.UploadFile is a *subclass* of that, so isinstance() against the
# fastapi type would reject every real upload.
from starlette.datastructures import UploadFile

from app.dependencies import PortalAuthDep
from app.models.bonus_configure_code import (
    BonusConfigureCodeCreate,
    BonusConfigureCodeResponse,
    BonusConfigureCodeUpdate,
)
from app.services.bonus_configure_code_service import (
    add_bonus_configure_code,
    get_bonus_configure_code,
    update_bonus_configure_code,
)

router = APIRouter(prefix="/bonus-configure-codes", tags=["bonus-configure-codes"])

# Fields that may be sent as empty strings in multipart form data — treated
# as "not provided" so the Pydantic model falls back to its default (None).
_OPTIONAL_FORM_FIELDS = {
    "max_amount", "valid_from", "valid_to", "display_title", "display_description",
    "terms_url", "banner_image_url", "badge_text", "cta_text", "min_display_amount",
    "system_auto_apply",
}


def _parse_manual_bonus_filename(filename: str) -> tuple[str | None, int | None, str | None]:
    """
    Mirrors the front-end check: ANYNAME-MONTH-DD-TOTPLAYERSCOUNT-TOTALGRANTAMOUNT.csv

    Returns (error, total_players, total_bonus_amount) — error is None on success.
    """
    if not filename.lower().endswith(".csv"):
        return "File must be a CSV file (.csv).", None, None
    parts = filename[:-4].split("-")
    if len(parts) != 5 or any(not p for p in parts):
        return "Filename must follow the format ANYNAME-MONTH-DD-TOTPLAYERSCOUNT-TOTALGRANTAMOUNT.csv", None, None
    _, _, _, total_players_count, total_grant_amount = parts
    if not total_players_count.isdigit() or not total_grant_amount.isdigit():
        return "TOTPLAYERSCOUNT and TOTALGRANTAMOUNT in the filename must be numeric.", None, None
    return None, int(total_players_count), total_grant_amount


@router.get("/{code_id}", response_model=BonusConfigureCodeResponse)
async def get_bonus_configure_code_route(
    code_id: int,
    ctx: PortalAuthDep,
) -> BonusConfigureCodeResponse:
    return await get_bonus_configure_code(code_id)


@router.post("", response_model=BonusConfigureCodeResponse, status_code=201)
async def create_bonus_configure_code(
    ctx: PortalAuthDep,
    request: Request,
) -> BonusConfigureCodeResponse:
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        # Manual bonus flow: CSV upload, filename becomes the code.
        form = await request.form()
        csv_file = form.get("csv_file")
        if not isinstance(csv_file, UploadFile) or not csv_file.filename:
            raise HTTPException(status_code=422, detail="csv_file is required when is_manual_bonus is true")

        name_error, total_players, total_bonus_amount = _parse_manual_bonus_filename(csv_file.filename)
        if name_error:
            raise HTTPException(status_code=422, detail=name_error)

        fields: dict[str, object] = {}
        for key, value in form.multi_items():
            if key == "csv_file":
                continue
            if key in _OPTIONAL_FORM_FIELDS and isinstance(value, str) and value.strip() == "":
                continue
            fields[key] = value
        fields["is_manual_bonus"] = True
        fields["code"] = csv_file.filename[:-4]  # strip .csv — filename minus extension is the code

        try:
            payload = BonusConfigureCodeCreate(**fields)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors(include_url=False)) from exc

        payload.created_by = ctx.user_id
        return await add_bonus_configure_code(
            payload,
            request.app.state.redis,
            csv_file=csv_file,
            total_players=total_players,
            total_bonus_amount=total_bonus_amount,
            kafka_producer=request.app.state.kafka_producer,
        )

    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid JSON body") from exc

    payload = BonusConfigureCodeCreate(**body)
    payload.created_by = ctx.user_id
    return await add_bonus_configure_code(payload, request.app.state.redis)


@router.patch("/{code_id}", response_model=BonusConfigureCodeResponse)
async def patch_bonus_configure_code(
    code_id: int,
    payload: BonusConfigureCodeUpdate,
    ctx: PortalAuthDep,
    request: Request,
) -> BonusConfigureCodeResponse:
    payload.updated_by = ctx.user_id
    return await update_bonus_configure_code(code_id, payload, request.app.state.redis)
