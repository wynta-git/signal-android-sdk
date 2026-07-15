import hashlib
from typing import Any

from jinja2 import Environment, StrictUndefined, TemplateError
from pydantic import BaseModel


class TemplateRenderError(Exception):
    pass


class RenderedPush(BaseModel):
    title: str
    body: str
    image_url: str | None = None


class RenderedInApp(BaseModel):
    variant_id: str
    template_type: str
    render_engine: str
    title: str | None = None
    body: str | None = None
    media: dict[str, Any] | None = None
    cta: list[dict[str, Any]] = []
    close_button_visibility: str = "always"
    layout: dict[str, Any] | None = None
    web_view_url: str | None = None


_env = Environment(undefined=StrictUndefined, autoescape=False)


def _render(text: str, ctx: dict[str, Any]) -> str:
    try:
        return _env.from_string(text).render(**ctx)
    except TemplateError as exc:
        raise TemplateRenderError(str(exc)) from exc


def _render_opt(text: str | None, ctx: dict[str, Any]) -> str | None:
    if text is None:
        return None
    return _render(text, ctx)


def pick_variant(
    variants: list[dict[str, Any]], campaign_id: str, user_id: str
) -> dict[str, Any]:
    """Deterministic weighted variant assignment — same (campaign_id, user_id) always
    resolves to the same variant, so re-sends of a recurring campaign stay stable."""
    ordered = sorted(variants, key=lambda v: v["variant_id"])
    if len(ordered) == 1:
        return ordered[0]

    total = sum(v.get("weight", 0) for v in ordered)
    if total <= 0:
        return ordered[0]

    digest = hashlib.sha256(f"{campaign_id}:{user_id}".encode()).hexdigest()
    h = int(digest, 16) % total

    cumulative = 0
    for variant in ordered:
        cumulative += variant.get("weight", 0)
        if h < cumulative:
            return variant
    return ordered[-1]


def _render_layout(
    template_type: str, layout: dict[str, Any] | None, ctx: dict[str, Any]
) -> dict[str, Any] | None:
    if layout is None:
        return None
    if template_type == "carousel":
        return {
            "slides": [
                {
                    "image_url": s.get("image_url"),
                    "title": _render_opt(s.get("title"), ctx),
                    "body": _render_opt(s.get("body"), ctx),
                }
                for s in layout.get("slides", [])
            ]
        }
    if template_type == "survey":
        return {
            "questions": [
                {
                    "question_text": _render(q.get("question_text", ""), ctx),
                    "options": q.get("options", []),
                }
                for q in layout.get("questions", [])
            ]
        }
    if template_type == "rating":
        return {
            "max_stars": layout.get("max_stars", 5),
            "prompt": _render_opt(layout.get("prompt"), ctx),
        }
    # lead_gen, gamification, html_nudge: no merge-tag text fields to render —
    # field labels/game config/html/hosted_url are passed through literally.
    return layout


def render_in_app(
    template_doc: dict[str, Any],
    user_doc: dict[str, Any] | None,
    ctx: dict[str, Any],
    campaign_id: str,
    user_id: str,
) -> RenderedInApp:
    variants = template_doc.get("variants") or []
    variant = pick_variant(variants, campaign_id, user_id)

    render_ctx = {
        "user": (user_doc or {}).get("traits", {}),
        "ctx": ctx,
        "project": {},
    }

    rendered_cta = [
        {
            "role": c.get("role"),
            "label": _render_opt(c.get("label"), render_ctx),
            "action": c.get("action"),
            "value": c.get("value"),  # literal — never rendered, avoids injection into URLs
        }
        for c in variant.get("cta", [])
    ]

    return RenderedInApp(
        variant_id=variant["variant_id"],
        template_type=variant["template_type"],
        render_engine=variant["render_engine"],
        title=_render_opt(variant.get("title"), render_ctx),
        body=_render_opt(variant.get("body"), render_ctx),
        media=variant.get("media"),
        cta=rendered_cta,
        close_button_visibility=variant.get("close_button_visibility", "always"),
        layout=_render_layout(variant["template_type"], variant.get("layout"), render_ctx),
        web_view_url=variant.get("web_view_url"),  # literal — never rendered
    )


def render_push(
    template_doc: dict[str, Any],
    user_doc: dict[str, Any] | None,
    ctx: dict[str, Any],
    project_doc: dict[str, Any] | None,
) -> RenderedPush:
    push = template_doc.get("body") or {}
    render_ctx = {
        "user": (user_doc or {}).get("traits", {}),
        "ctx": ctx,
        "project": project_doc or {},
    }
    title = _render(push.get("title", ""), render_ctx)
    body = _render(push.get("body", ""), render_ctx)
    image_url = push.get("image_url")
    return RenderedPush(title=title, body=body, image_url=image_url)
