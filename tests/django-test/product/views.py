import json
import os
from django.contrib.staticfiles import finders
from django.http import FileResponse, Http404, HttpResponse
from django.template.loader import render_to_string


def serve_spa(request, prefix, path=""):
    rel = (path or "index.html").lstrip("/")
    found = finders.find(f"{prefix}/{rel}")
    if not found or os.path.isdir(found):
        raise Http404
    return FileResponse(open(found, "rb"))


def _inject_slots(request, found_path, app):
    html = open(found_path, "rb").read().decode("utf-8")
    ctx = {"app": app, "request": request}

    header = render_to_string("product/header.html", ctx, request=request)
    html = html.replace(
        '<div id="dj-header-placeholder"></div>',
        f'<script>window.__DJH_SLOT__={json.dumps(header)};</script>'
        f'<div id="dj-header-placeholder">{header}</div>',
        1,
    )

    sidebar = render_to_string("product/sidebar.html", ctx, request=request)
    html = html.replace(
        '<div id="dj-sidebar-placeholder"></div>',
        f'<script>window.__DJH_SIDEBAR__={json.dumps(sidebar)};</script>'
        f'<div id="dj-sidebar-placeholder">{sidebar}</div>',
        1,
    )

    return HttpResponse(html, content_type="text/html")


def bonus(request, path=""):
    if not path:
        found = finders.find("product/bonus/index.html")
        if not found:
            raise Http404
        return _inject_slots(request, found, app="bonus")
    return serve_spa(request, prefix="product/bonus", path=path)


def crm(request, path=""):
    if not path:
        found = finders.find("product/crm/index.html")
        if not found:
            raise Http404
        return _inject_slots(request, found, app="crm")
    return serve_spa(request, prefix="product/crm", path=path)
