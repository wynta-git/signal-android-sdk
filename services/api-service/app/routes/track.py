from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ValidationError

from app.middleware.ratelimit import project_rate_limit, user_rate_limit
from app.auth.token import TokenContext
from fastapi import Depends
from shared.models.events import REGISTERED_EVENTS, EventEnvelope

router = APIRouter()
log = structlog.get_logger()

MAX_EVENTS_PER_BATCH = 100


class TrackRequest(BaseModel):
    events: list[Any]


class EventError(BaseModel):
    index: int
    event_id: str | None = None
    code: str
    message: str


class TrackResponse(BaseModel):
    accepted: int
    rejected: int
    errors: list[EventError]


def _map_validation_error(e: ValidationError) -> tuple[str, str]:
    first = e.errors(include_url=False)[0]
    msg: str = first.get("msg", "Validation error")
    error_type: str = first.get("type", "")
    if error_type == "missing":
        field = " -> ".join(str(loc) for loc in first.get("loc", []))
        return "missing_required", f"Missing required field: {field}"
    return "invalid_type", msg


@router.post(
    "/v1/track",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=TrackResponse,
)
async def track(
    request: Request,
    body: TrackRequest,
    ctx: TokenContext = Depends(project_rate_limit),
) -> TrackResponse:
    if len(body.events) > MAX_EVENTS_PER_BATCH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "payload_too_large",
                "message": f"Max {MAX_EVENTS_PER_BATCH} events per request",
            },
        )

    accepted: list[dict] = []
    errors: list[EventError] = []

    for i, raw in enumerate(body.events):
        event_id = raw.get("event_id") if isinstance(raw, dict) else None

        # Validate envelope fields (user_id, event_id, timestamp, sdk are required)
        try:
            event = EventEnvelope.model_validate(raw)
        except ValidationError as e:
            code, message = _map_validation_error(e)
            errors.append(EventError(index=i, event_id=event_id, code=code, message=message))
            continue

        # Warn on unregistered event names — accept anyway, never drop events
        if event.event_name not in REGISTERED_EVENTS:
            log.warning(
                "unknown_event_name",
                event_name=event.event_name,
                event_id=str(event.event_id),
                user_id=event.user_id,
                project_id=ctx.project_id,
                index=i,
            )

        # Per-user rate limit — checked now that we have user_id from the payload
        try:
            await user_rate_limit(ctx.project_id, event.user_id, request.app.state.redis)
        except HTTPException:
            errors.append(
                EventError(
                    index=i,
                    event_id=str(event.event_id),
                    code="rate_limited",
                    message="User rate limit exceeded",
                )
            )
            continue

        # Inject server-side fields — project_id from token, received_at from server clock
        accepted.append(
            event.model_copy(
                update={
                    "project_id": ctx.project_id,
                    "received_at": datetime.now(timezone.utc),
                }
            ).model_dump(mode="json")
        )

    if accepted:
        try:
            await request.app.state.producer.publish_events(accepted)
        except Exception:
            raise HTTPException(
                status_code=503,
                detail={"code": "internal_error", "message": "Failed to publish events"},
            )

    log.info("track", accepted=len(accepted), rejected=len(errors))
    return TrackResponse(accepted=len(accepted), rejected=len(errors), errors=errors)
