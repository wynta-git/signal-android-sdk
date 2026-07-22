"""Smoke tests: models, renderer, suppression, circuit breaker, template cache."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.circuit_breaker import CircuitBreaker, State
from app.models import GroupedSendJob, SendJob
from app.renderer import (
    RenderedPush,
    TemplateRenderError,
    build_email_substitutions,
    render_email_shared,
    render_push,
)

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
# Email renderer — shared-template + substitution-token model
# ---------------------------------------------------------------------------


def test_render_email_shared_renders_project_context() -> None:
    template_doc = {
        "body": {
            "subject": "Hi -user.name-",
            "html": "<p>From {{ project.name }}: -user.name-, -ctx.cart_value-</p>",
            "text": "From {{ project.name }}",
        }
    }
    project_doc = {"name": "Acme"}
    result = render_email_shared(template_doc, project_doc)
    # Jinja renders the project variable...
    assert "From Acme" in result.html
    # ...but leaves per-recipient substitution tokens completely untouched.
    assert "-user.name-" in result.html
    assert "-ctx.cart_value-" in result.html
    assert result.subject == "Hi -user.name-"


def test_render_email_shared_fails_on_real_jinja_user_var() -> None:
    """user/ctx are deliberately not part of the shared render context — a
    template author who mistakenly writes real Jinja syntax for a per-user
    value must get a clear render error, not silent wrong output."""
    template_doc = {"body": {"subject": "S", "html": "<p>Hi {{ user.name }}</p>"}}
    with pytest.raises(TemplateRenderError):
        render_email_shared(template_doc, {})


def test_build_email_substitutions_flattens_dotted_paths() -> None:
    user_doc = {"traits": {"name": "Asha", "plan": "pro"}}
    ctx = {"cart_value": "₹999"}
    result = build_email_substitutions(user_doc, ctx, "https://x.test/unsub")
    assert result["-user.name-"] == "Asha"
    assert result["-user.plan-"] == "pro"
    assert result["-ctx.cart_value-"] == "₹999"
    assert result["-unsubscribe_url-"] == "https://x.test/unsub"


def test_build_email_substitutions_handles_missing_user() -> None:
    result = build_email_substitutions(None, {}, "https://x.test/unsub")
    assert result == {"-unsubscribe_url-": "https://x.test/unsub"}


# ---------------------------------------------------------------------------
# SendGrid provider
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sendgrid_send_batch_accepted() -> None:
    from app.providers.base import EmailRecipient
    from app.providers.sendgrid import SendGridProvider

    provider = SendGridProvider(api_key="SG.test", from_email="hello@acme.com", from_name="Acme")
    recipients = [EmailRecipient(email="a@x.com", substitutions={"-user.name-": "Alice"}, custom_args={})]

    mock_resp = MagicMock()
    mock_resp.status_code = 202
    mock_resp.headers = {"X-Message-Id": "msg-123"}

    with patch("app.providers.sendgrid._http_client.post", new=AsyncMock(return_value=mock_resp)):
        result = await provider.send_batch(recipients, "Hi -user.name-", "<p>Hi -user.name-</p>", None)

    assert result.status == "accepted"
    assert result.provider_msg_id == "msg-123"


@pytest.mark.asyncio
async def test_sendgrid_send_batch_transient_error_raises() -> None:
    from app.providers.base import EmailRecipient
    from app.providers.sendgrid import SendGridProvider, SendGridTransientError

    provider = SendGridProvider(api_key="SG.test", from_email="hello@acme.com", from_name=None)
    recipients = [EmailRecipient(email="a@x.com", substitutions={}, custom_args={})]

    mock_resp = MagicMock()
    mock_resp.status_code = 500
    mock_resp.text = "server error"

    with patch("app.providers.sendgrid._http_client.post", new=AsyncMock(return_value=mock_resp)):
        with pytest.raises(SendGridTransientError):
            await provider.send_batch(recipients, "Subject", "<p>Body</p>", None)


@pytest.mark.asyncio
async def test_sendgrid_send_batch_permanent_error_rejected() -> None:
    from app.providers.base import EmailRecipient
    from app.providers.sendgrid import SendGridProvider

    provider = SendGridProvider(api_key="SG.test", from_email="hello@acme.com", from_name=None)
    recipients = [EmailRecipient(email="a@x.com", substitutions={}, custom_args={})]

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = "bad request"

    with patch("app.providers.sendgrid._http_client.post", new=AsyncMock(return_value=mock_resp)):
        result = await provider.send_batch(recipients, "Subject", "<p>Body</p>", None)

    assert result.status == "rejected"
    assert result.error["code"] == "sendgrid_400"


@pytest.mark.asyncio
async def test_sendgrid_stub_provider_accepts() -> None:
    from app.providers.base import EmailRecipient
    from app.providers.sendgrid import SendGridStubProvider

    provider = SendGridStubProvider()
    recipients = [EmailRecipient(email="a@x.com", substitutions={}, custom_args={})]
    result = await provider.send_batch(recipients, "Subject", "<p>Body</p>", None)
    assert result.status == "accepted"
    assert result.provider_msg_id is not None


# ---------------------------------------------------------------------------
# Mailgun adapter — intentionally unimplemented, proves the registry isn't
# tied to SendGrid
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mailgun_provider_send_batch_raises_not_implemented() -> None:
    from app.providers.base import EmailRecipient
    from app.providers.mailgun import MailgunProvider

    provider = MailgunProvider(api_key="key-test", domain="mg.acme.com", from_email="hello@acme.com", from_name=None)
    recipients = [EmailRecipient(email="a@x.com", substitutions={}, custom_args={})]
    with pytest.raises(NotImplementedError):
        await provider.send_batch(recipients, "Subject", "<p>Body</p>", None)


@pytest.mark.asyncio
async def test_mailgun_stub_provider_returns_rejected() -> None:
    from app.providers.base import EmailRecipient
    from app.providers.mailgun import MailgunStubProvider

    provider = MailgunStubProvider()
    recipients = [EmailRecipient(email="a@x.com", substitutions={}, custom_args={})]
    result = await provider.send_batch(recipients, "Subject", "<p>Body</p>", None)
    assert result.status == "rejected"
    assert result.error["code"] == "mailgun_not_implemented"


# ---------------------------------------------------------------------------
# Email provider registry — not tightly coupled to SendGrid
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_email_provider_falls_back_to_stub_when_unconfigured() -> None:
    from app.providers.email import get_email_provider
    from app.providers.sendgrid import SendGridStubProvider

    db = MagicMock()
    with (
        patch("app.providers.email.get_project_email_provider_name", new=AsyncMock(return_value="sendgrid")),
        patch("app.providers.email.get_project_sendgrid_credential", new=AsyncMock(return_value=None)),
    ):
        provider = await get_email_provider("proj_abc", db)
    assert isinstance(provider, SendGridStubProvider)


@pytest.mark.asyncio
async def test_get_email_provider_dispatches_to_mailgun_when_configured() -> None:
    """A brand/project configured for Mailgun must resolve to a real
    MailgunProvider, not silently fall back to SendGrid."""
    from app.providers.email import get_email_provider
    from app.providers.mailgun import MailgunProvider

    db = MagicMock()
    mailgun_cred = {
        "api_key": "key-test",
        "domain": "mg.acme.com",
        "from_email": "hello@acme.com",
        "from_name": "Acme",
    }
    with (
        patch("app.providers.email.get_project_email_provider_name", new=AsyncMock(return_value="mailgun")),
        patch("app.providers.email.get_project_mailgun_credential", new=AsyncMock(return_value=mailgun_cred)),
    ):
        provider = await get_email_provider("proj_abc", db, brand_id="brand_217")
    assert isinstance(provider, MailgunProvider)


@pytest.mark.asyncio
async def test_get_email_provider_defaults_to_sendgrid_for_unconfigured_projects() -> None:
    """Every brand configured before the email_provider discriminator field
    existed must keep resolving to SendGrid — get_project_email_provider_name
    itself defaults to 'sendgrid', but this confirms the registry honors it."""
    from app.providers.email import get_email_provider
    from app.providers.sendgrid import SendGridProvider

    db = MagicMock()
    sendgrid_cred = {"api_key": "SG.test", "from_email": "hello@acme.com", "from_name": "Acme"}
    with (
        patch("app.providers.email.get_project_email_provider_name", new=AsyncMock(return_value="sendgrid")),
        patch("app.providers.email.get_project_sendgrid_credential", new=AsyncMock(return_value=sendgrid_cred)),
    ):
        provider = await get_email_provider("proj_abc", db)
    assert isinstance(provider, SendGridProvider)


# ---------------------------------------------------------------------------
# GroupedSendJob parsing
# ---------------------------------------------------------------------------


def test_grouped_send_job_parses_valid_dict() -> None:
    raw = {
        "send_id": "s1",
        "project_id": "proj_abc",
        "campaign_id": "camp_xyz",
        "campaign_run_id": "run_001",
        "user_ids": ["u1", "u2", "u3"],
        "channel": "email",
        "template_id": "tmpl_cart",
        "deliver_at": "2026-05-25T09:00:00+00:00",
    }
    job = GroupedSendJob.model_validate(raw)
    assert job.user_ids == ["u1", "u2", "u3"]
    assert job.channel == "email"


# ---------------------------------------------------------------------------
# Suppression
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_suppression_returns_true_when_key_exists() -> None:
    from app.suppression import is_suppressed

    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=1)
    assert await is_suppressed(redis, "proj_abc", "user_42", "push") is True
    redis.exists.assert_called_once_with("pam:suppress:proj_abc:user_42:push")


@pytest.mark.asyncio
async def test_suppression_returns_false_when_key_missing() -> None:
    from app.suppression import is_suppressed

    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=0)
    assert await is_suppressed(redis, "proj_abc", "user_42", "push") is False


@pytest.mark.asyncio
async def test_suppression_is_channel_scoped() -> None:
    """Suppressing a user for email must not suppress them for push."""
    from app.suppression import is_suppressed

    redis = AsyncMock()

    async def fake_exists(key: str) -> int:
        return 1 if key.endswith(":email") else 0

    redis.exists = AsyncMock(side_effect=fake_exists)
    assert await is_suppressed(redis, "proj_abc", "user_42", "email") is True
    assert await is_suppressed(redis, "proj_abc", "user_42", "push") is False


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
