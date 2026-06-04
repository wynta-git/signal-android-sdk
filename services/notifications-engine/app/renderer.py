from typing import Any

from jinja2 import Environment, StrictUndefined, TemplateError
from pydantic import BaseModel


class TemplateRenderError(Exception):
    pass


class RenderedPush(BaseModel):
    title: str
    body: str
    image_url: str | None = None


_env = Environment(undefined=StrictUndefined, autoescape=False)


def _render(text: str, ctx: dict[str, Any]) -> str:
    try:
        return _env.from_string(text).render(**ctx)
    except TemplateError as exc:
        raise TemplateRenderError(str(exc)) from exc


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
    body = _render(push.get("body") or push.get("message", ""), render_ctx)
    image_url = push.get("image_url")
    return RenderedPush(title=title, body=body, image_url=image_url)
