from functools import partial

from django.urls import path, re_path

from product.views import bonus, crm, serve_spa

urlpatterns = [
    # Serve wynta-bonus at /product/bonus/
    path("product/bonus/", bonus),
    re_path(r"^product/bonus/(?P<path>.+)$", bonus),

    # Serve wynta-crm at /product/crm/
    path("product/crm/", crm),
    re_path(r"^product/crm/(?P<path>.+)$", crm),

    # Logo referenced as /wynta-logo.png from both apps
    re_path(r"^(?P<path>wynta-logo\.png)$", partial(serve_spa, prefix="product/bonus")),
]
