import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "django-test-project-not-for-production"

DEBUG = True

ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "product",
]

MIDDLEWARE = [
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

FRONTEND_DIR = BASE_DIR.parent / "front-end"
BONUS_OUT_DIR = FRONTEND_DIR / "wynta-bonus" / "out"
CRM_OUT_DIR = FRONTEND_DIR / "wynta-crm" / "out"

# Named prefixes map out/ contents into the static namespace:
#   bonus/index.html, bonus/_next/..., crm/index.html, crm/_next/...
# collectstatic copies these into STATIC_ROOT.
STATICFILES_DIRS = [
    ("product/bonus", str(BONUS_OUT_DIR)),
    ("product/crm", str(CRM_OUT_DIR)),
]
