"""Smoke tests: models, renderer, suppression, circuit breaker, template cache."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.circuit_breaker import CircuitBreaker, State
from app.models import SendJob
from app.renderer import RenderedPush, TemplateRenderError, render_push

# ---------------------------------------------------------------------------
# SendJob parsing
# ---------------------------------------------------------------------------


def test_send_job_parses_valid_dict() -> None:
    raw = {
        "send_id": "s1",
        "project_id": "proj_abc",
        "campaign_id": "camp_xyz",
        "campaign_run_id": "run_001",
        "user_id": "user_42",
        "channel": "push",
        "template_id": "tmpl_cart",
        "context": {"cart_value": "99"},
        "deliver_at": "2026-05-25T09:00:00+00:00",
    }
    job = SendJob.model_validate(raw)
    assert job.send_id == "s1"
    assert job.channel == "push"
    assert job.context == {"cart_value": "99"}


def test_send_job_defaults_empty_context() -> None:
    raw = {
        "send_id": "s2",
        "project_id": "proj_abc",
        "campaign_id": "camp_xyz",
        "campaign_run_id": "run_001",
        "user_id": "user_42",
        "channel": "push",
        "template_id": "tmpl_cart",
        "deliver_at": "2026-05-25T09:00:00+00:00",
    }
    job = SendJob.model_validate(raw)
    assert job.context == {}


# ---------------------------------------------------------------------------
# Renderer
# ---------------------------------------------------------------------------


def test_render_push_resolves_vars() -> None:
    template_doc = {
        "push": {
            "title": "Hi {{user.name}}",
            "body": "Your cart is {{ctx.cart_value}}",
        }
    }
    user_doc = {"traits": {"name": "Asha"}}
    ctx = {"cart_value": "₹999"}
    result = render_push(template_doc, user_doc, ctx, None)
    assert isinstance(result, RenderedPush)
    assert result.title == "Hi Asha"
    assert result.body == "Your cart is ₹999"


def test_render_push_missing_var_raises() -> None:
    template_doc = {"push": {"title": "Hi {{user.missing_field}}", "body": "test"}}
    with pytest.raises(TemplateRenderError):
        render_push(template_doc, {"traits": {}}, {}, None)


def test_render_push_no_image_url() -> None:
    template_doc = {"push": {"title": "T", "body": "B"}}
    result = render_push(template_doc, None, {}, None)
    assert result.image_url is None


# ---------------------------------------------------------------------------
# Suppression
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_suppression_returns_true_when_key_exists() -> None:
    from app.suppression import is_suppressed

    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=1)
    assert await is_suppressed(redis, "proj_abc", "user_42") is True
    redis.exists.assert_called_once_with("pam:suppress:proj_abc:user_42")


@pytest.mark.asyncio
async def test_suppression_returns_false_when_key_missing() -> None:
    from app.suppression import is_suppressed

    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=0)
    assert await is_suppressed(redis, "proj_abc", "user_42") is False


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------


def test_circuit_breaker_opens_after_threshold() -> None:
    cb = CircuitBreaker()
    assert cb.allow() is True
    for _ in range(5):
        cb.record_failure()
    assert cb._state == State.OPEN
    assert cb.allow() is False


def test_circuit_breaker_half_open_after_cooldown() -> None:
    cb = CircuitBreaker()
    for _ in range(5):
        cb.record_failure()
    # Simulate cooldown elapsed
    cb._opened_at = time.monotonic() - 31
    assert cb.allow() is True
    assert cb._state == State.HALF_OPEN


def test_circuit_breaker_closes_on_success() -> None:
    cb = CircuitBreaker()
    for _ in range(5):
        cb.record_failure()
    cb._opened_at = time.monotonic() - 31
    cb.allow()  # transitions to HALF_OPEN
    cb.record_success()
    assert cb._state == State.CLOSED
    assert cb._failures == 0


# ---------------------------------------------------------------------------
# Template cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_template_cache_hits_on_second_call() -> None:
    from app.consumer import _get_cached_template, _template_cache

    _template_cache.clear()
    template_doc = {"template_id": "tmpl_1", "push": {"title": "T", "body": "B"}}

    db = MagicMock()
    with patch("app.consumer.get_template", new=AsyncMock(return_value=template_doc)) as mock_get:
        result1 = await _get_cached_template(db, "proj_abc", "tmpl_1")
        result2 = await _get_cached_template(db, "proj_abc", "tmpl_1")

    assert result1 == template_doc
    assert result2 == template_doc
    mock_get.assert_called_once()  # DB hit only once
