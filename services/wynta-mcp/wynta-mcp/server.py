"""MCP server wrapping the Wynta Mobile Dashboard API."""
import json
import os
from contextvars import ContextVar
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

BASE_URL = "https://staging.wynta.com/api/v1"
BONUS_BASE_URL = "http://localhost:8100/api/v1/bonus"
AUTH_BASE_URL = "http://localhost:8006"

mcp = FastMCP("wynta")

_token_ctx: ContextVar[str] = ContextVar("wynta_token", default="")


def _token() -> str:
    token = _token_ctx.get()
    if not token:
        raise ValueError("No API token — set Authorization: Bearer <token> in the request header")
    return token


def _headers() -> dict[str, str]:
    ##return {"Authorization": f"Token {_token()}", "Content-Type": "application/json"}
    return {"Authorization": f"Bearer d7a70da931aadab1eac6cce557934cb07706bbea", "Content-Type": "application/json"}


async def _get(path: str, params: dict[str, Any] | None = None) -> str:
    params = {k: v for k, v in (params or {}).items() if v is not None}
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}{path}", headers=_headers(), params=params, timeout=30)
        return r.text


async def _post(path: str, body: dict[str, Any]) -> str:
    payload = {k: v for k, v in body.items() if v is not None}
    # print(f"post::::{payload}")
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BASE_URL}{path}", headers=_headers(), json=payload, timeout=30)
        return r.text


async def _put(path: str, body: dict[str, Any]) -> str:
    payload = {k: v for k, v in body.items() if v is not None}
    # print(f"put::::{payload}")
    async with httpx.AsyncClient() as client:
        r = await client.put(f"{BASE_URL}{path}", headers=_headers(), json=payload, timeout=30)
        return r.text


async def _patch(path: str, body: dict[str, Any]) -> str:
    payload = {k: v for k, v in body.items() if v is not None}
    # print(f"_patch::::{payload}")
    async with httpx.AsyncClient() as client:
        r = await client.patch(f"{BASE_URL}{path}", headers=_headers(), json=payload, timeout=30)
        return r.text


async def _delete(path: str, params: dict[str, Any] | None = None) -> str:
    params = {k: v for k, v in (params or {}).items() if v is not None}
    print(f"_delete::::{params}")
    # async with httpx.AsyncClient() as client:
    #     r = await client.delete(f"{BASE_URL}{path}", headers=_headers(), params=params, timeout=30)
    #     return r.text


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@mcp.tool()
async def get_dashboard_summary(
    program_id: int | None = None,
    customid: str | None = None,
    fromdate: str | None = None,
    todate: str | None = None,
    prev_compare: bool | None = None,
    compare_period: str | None = None,
) -> str:
    """Return Quick Stats for the mobile dashboard (supports Admin and Affiliate roles).

    Args:
        program_id: Affiliate programme ID (optional).
        customid: Date range filter, e.g. "Last 7 Days" or "This Month".
        fromdate: Start date MM/DD/YYYY.
        todate: End date MM/DD/YYYY.
        prev_compare: Enable comparison with previous period.
        compare_period: Comparison period type: period, custom, month, or year.
    """
    return await _get(
        "/dashboard-summary/",
        {
            "program_id": program_id,
            "customid": customid,
            "fromdate": fromdate,
            "todate": todate,
            "prev_compare": prev_compare,
            "compare_period": compare_period,
        },
    )


@mcp.tool()
async def get_top_affiliates(
    program_id: int | None = None,
    customid: str | None = None,
    fromdate: str | None = None,
    todate: str | None = None,
    affiliate_id: int | None = None,
    currencies: str | None = None,
    sort_by: str | None = None,
    sort_order: str | None = None,
) -> str:
    """Return top 10 affiliates for the mobile dashboard (Admin only).

    Args:
        program_id: Affiliate programme ID (optional).
        customid: Date range filter, e.g. "Last 7 Days".
        fromdate: Start date MM/DD/YYYY.
        todate: End date MM/DD/YYYY.
        affiliate_id: Filter by specific affiliate ID.
        currencies: Currency filter, e.g. "euro" or "gbp".
        sort_by: Column to sort by (revenue, clicks, etc.).
        sort_order: "asc" or "desc".
    """
    return await _get(
        "/top-affiliates/",
        {
            "program_id": program_id,
            "customid": customid,
            "fromdate": fromdate,
            "todate": todate,
            "affiliate_id": affiliate_id,
            "currencies": currencies,
            "sort_by": sort_by,
            "sort_order": sort_order,
        },
    )


@mcp.tool()
async def get_top_campaigns(
    program_id: int | None = None,
    customid: str | None = None,
    fromdate: str | None = None,
    todate: str | None = None,
    currencies: str | None = None,
    sort_by: str | None = None,
    sort_order: str | None = None,
) -> str:
    """Return top 10 campaigns for the mobile dashboard (Admin and Affiliate roles).

    Args:
        program_id: Affiliate programme ID (optional).
        customid: Date range filter, e.g. "Last 7 Days".
        fromdate: Start date MM/DD/YYYY.
        todate: End date MM/DD/YYYY.
        currencies: Currency filter, e.g. "euro" or "gbp".
        sort_by: Column to sort by.
        sort_order: "asc" or "desc".
    """
    return await _get(
        "/top-campaigns/",
        {
            "program_id": program_id,
            "customid": customid,
            "fromdate": fromdate,
            "todate": todate,
            "currencies": currencies,
            "sort_by": sort_by,
            "sort_order": sort_order,
        },
    )


# ---------------------------------------------------------------------------
# Affiliates
# ---------------------------------------------------------------------------

@mcp.tool()
async def get_affiliate_form_data() -> str:
    """Return country and site dropdown data needed for the create-affiliate form."""
    return await _get("/affiliate-form-data/")


@mcp.tool()
async def list_affiliates(
    program_id: int | None = None,
    page: int | None = None,
    page_size: int | None = None,
    search: str | None = None,
    status: str | None = None,
    filter: str | None = None,
) -> str:
    """Return a paginated list of affiliates (Admin only).

    Args:
        program_id: Scope results to a specific programme.
        page: Page number (default 1).
        page_size: Results per page (default 25, max 100).
        search: Search by email, last name, or exact affiliate ID.
        status: Filter by status: Pending|Approved|Rejected|Suspended|Pause|Inactive.
        filter: Pass "referral" to show only sub-affiliates.
    """
    return await _get(
        "/affiliates/",
        {
            "program_id": program_id,
            "page": page,
            "page_size": page_size,
            "search": search,
            "status": status,
            "filter": filter,
        },
    )


@mcp.tool()
async def create_affiliate(
    email: str,
    program_id: int | None = None,
    contactname: str | None = None,
    lastname: str | None = None,
    companyname: str | None = None,
    password: str | None = None,
    dob: str | None = None,
    telephone: str | None = None,
    address: str | None = None,
    address2: str | None = None,
    city: str | None = None,
    state: str | None = None,
    country: str | None = None,
    postcode: str | None = None,
    contactmode: str | None = None,
    superaffiliate: int | None = None,
    affiliate_type: str | None = None,
    siteid: list[int] | None = None,
    site_url: list[str] | None = None,
) -> str:
    """Create a new affiliate (Admin only).

    Args:
        email: Affiliate email address (required).
        program_id: Programme ID to create affiliate under.
        contactname: First/contact name.
        lastname: Last name.
        companyname: Company name.
        password: Initial password.
        dob: Date of birth in DD-MM-YYYY format.
        telephone: Phone number.
        address: Address line 1.
        address2: Address line 2.
        city: City.
        state: State/region.
        country: Country.
        postcode: Postcode/ZIP.
        contactmode: "Email", "Phone", or "IM".
        superaffiliate: Parent affiliate ID for sub-affiliate creation.
        affiliate_type: Affiliate type string.
        siteid: List of site/brand IDs to assign.
        site_url: List of site URLs to assign.
    """
    return await _post(
        "/affiliates/",
        {
            "email": email,
            "program_id": program_id,
            "contactname": contactname,
            "lastname": lastname,
            "companyname": companyname,
            "password": password,
            "dob": dob,
            "telephone": telephone,
            "address": address,
            "address2": address2,
            "city": city,
            "state": state,
            "country": country,
            "postcode": postcode,
            "contactmode": contactmode,
            "superaffiliate": superaffiliate,
            "affiliate_type": affiliate_type,
            "siteid": siteid,
            "site_url": site_url,
        },
    )


@mcp.tool()
async def get_affiliate(affiliate_id: str, program_id: int | None = None) -> str:
    """Retrieve full profile of a single affiliate (Admin only).

    Args:
        affiliate_id: The affiliate's ID.
        program_id: Programme ID; returns 404 if affiliate does not belong to it.
    """
    return await _get(f"/affiliates/{affiliate_id}/", {"program_id": program_id})


@mcp.tool()
async def update_affiliate(
    affiliate_id: str,
    email: str | None = None,
    contactname: str | None = None,
    lastname: str | None = None,
    companyname: str | None = None,
    status: str | None = None,
    password: str | None = None,
    dob: str | None = None,
    affiliate_type: str | None = None,
    superaffiliate: int | None = None,
    contactmode: str | None = None,
    telephone: str | None = None,
    address: str | None = None,
    address2: str | None = None,
    city: str | None = None,
    state: str | None = None,
    country: str | None = None,
    postcode: str | None = None,
    siteid: list[int] | None = None,
    site_url: list[str] | None = None,
    assignuser: list[int] | None = None,
) -> str:
    """Full replacement update of an affiliate (PUT, Admin only).

    Args:
        affiliate_id: The affiliate's ID.
        email: New email address.
        contactname: First/contact name.
        lastname: Last name.
        companyname: Company name.
        status: New status: Pending|Approved|Rejected|Suspended|Pause|Inactive.
        password: New password.
        dob: Date of birth DD-MM-YYYY.
        affiliate_type: Affiliate type string.
        superaffiliate: Parent affiliate ID.
        contactmode: "Email", "Phone", or "IM".
        telephone: Phone number.
        address: Address line 1.
        address2: Address line 2.
        city: City.
        state: State/region.
        country: Country.
        postcode: Postcode/ZIP.
        siteid: List of site/brand IDs.
        site_url: List of site URLs.
        assignuser: PartnerUser IDs to assign.
    """
    return await _put(
        f"/affiliates/{affiliate_id}/",
        {
            "email": email,
            "contactname": contactname,
            "lastname": lastname,
            "companyname": companyname,
            "status": status,
            "password": password,
            "dob": dob,
            "affiliate_type": affiliate_type,
            "superaffiliate": superaffiliate,
            "contactmode": contactmode,
            "telephone": telephone,
            "address": address,
            "address2": address2,
            "city": city,
            "state": state,
            "country": country,
            "postcode": postcode,
            "siteid": siteid,
            "site_url": site_url,
            "assignuser": assignuser,
        },
    )


@mcp.tool()
async def patch_affiliate(affiliate_id: str, fields: str) -> str:
    """Partially update an affiliate (PATCH, Admin only).

    Args:
        affiliate_id: The affiliate's ID.
        fields: JSON string of fields to update, e.g. '{"status": "Approved"}'.
    """
    payload = json.loads(fields)
    return await _patch(f"/affiliates/{affiliate_id}/", payload)


@mcp.tool()
async def delete_affiliate(affiliate_id: str) -> str:
    """Delete an affiliate (Admin only).

    Args:
        affiliate_id: The affiliate's ID.
    """
    return await _delete(f"/affiliates/{affiliate_id}/")


@mcp.tool()
async def update_affiliate_status(
    aff_id: int,
    status: str,
    program_id: int | None = None,
) -> str:
    """Approve, reject, or suspend an affiliate (Admin only).

    Returns the new pending count and the next 10 pending affiliates.

    Args:
        aff_id: ID of the affiliate to update (required).
        status: New status — "Approved", "Rejected", or "Suspended" (required).
        program_id: Programme ID; validates affiliate belongs to this programme.
    """
    return await _post(
        "/update-affiliate-status/",
        {"aff_id": aff_id, "status": status, "program_id": program_id},
    )


# ---------------------------------------------------------------------------
# Commissions
# ---------------------------------------------------------------------------

@mcp.tool()
async def get_commission_form_data(program_id: int | None = None) -> str:
    """Return dropdown data needed to create or edit a commission.

    Args:
        program_id: Affiliate programme ID (optional).
    """
    return await _get("/commission-form-data/", {"program_id": program_id})


@mcp.tool()
async def list_commission_presets(
    program_id: int | None = None,
    comm_type: str | None = None,
) -> str:
    """Return commission presets for the programme (Admin only).

    Args:
        program_id: Affiliate programme ID (optional).
        comm_type: Filter by commission type.
    """
    return await _get("/commission-presets/", {"program_id": program_id, "comm_type": comm_type})


@mcp.tool()
async def get_commission_preset(preset_id: str, program_id: int | None = None) -> str:
    """Return full field data for a preset to pre-fill the commission form (Admin only).

    Args:
        preset_id: The preset's ID.
        program_id: Affiliate programme ID (optional).
    """
    return await _get(f"/commission-presets/{preset_id}/", {"program_id": program_id})


@mcp.tool()
async def list_commissions(
    program_id: int | None = None,
    hierarchy: bool | None = None,
    affiliate_id: int | None = None,
    comm_type: str | None = None,
    brand_id: list[int] | None = None,
    campaign_id: int | None = None,
    product_id: int | None = None,
    country: list[int] | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
) -> str:
    """List commissions (Admin only).

    Mode A (no affiliate_id): all commissions under the account manager with filters and pagination.
    Mode B (hierarchy=true + affiliate_id): 10-tier hierarchy for that affiliate.

    Args:
        program_id: Affiliate programme ID (optional).
        hierarchy: Set true to get the 10-tier hierarchy for affiliate_id (Mode B).
        affiliate_id: Mode B — required when hierarchy=true. Mode A — filter by affiliate.
        comm_type: Filter by commission type (Mode A).
        brand_id: Filter by site/brand IDs (Mode A).
        campaign_id: Filter by campaign ID (Mode A).
        product_id: Filter by product ID (Mode A).
        country: Filter by country IDs (Mode A).
        start_date: Filter commissions active on/after this date DD-MM-YYYY (Mode A).
        end_date: Filter commissions active on/before this date DD-MM-YYYY (Mode A).
        search: Search by affiliate email, brand name, campaign name, or commission ID (Mode A).
        page: Page number (default 1, Mode A only).
        page_size: Results per page (default 25, max 100, Mode A only).
    """
    params: dict[str, Any] = {
        "program_id": program_id,
        "hierarchy": hierarchy,
        "affiliate_id": affiliate_id,
        "comm_type": comm_type,
        "campaign_id": campaign_id,
        "product_id": product_id,
        "start_date": start_date,
        "end_date": end_date,
        "search": search,
        "page": page,
        "page_size": page_size,
    }
    if brand_id:
        params["brand_id"] = brand_id
    if country:
        params["country"] = country
    return await _get("/commissions/", params)


@mcp.tool()
async def create_commission(
    comm_type: str,
    program_id: int | None = None,
    affiliate_id: int | None = None,
    site_id: int | None = None,
    campaign_id: int | None = None,
    product_id: int | None = None,
    revshare: bool | None = None,
    revsharepercent: float | None = None,
    revtype: str | None = None,
    ringfence: bool | None = None,
    cpachoice: bool | None = None,
    criteriaacquisition: str | None = None,
    criteriavalue: float | None = None,
    cpacommissionvalue: float | None = None,
    currency: str | None = None,
    cpacumulative: bool | None = None,
    exclude_rev: bool | None = None,
    tierchoice: bool | None = None,
    tiertype: str | None = None,
    tier_ringfence: bool | None = None,
    tier_brackets: list[dict] | None = None,
    cplchoice: bool | None = None,
    cplcommissionvalue: float | None = None,
    cplcurrency: str | None = None,
    cpcchoice: bool | None = None,
    cpccommissionvalue: float | None = None,
    cpccurrency: str | None = None,
    cpichoice: bool | None = None,
    cpicommissionvalue: float | None = None,
    cpicurrency: str | None = None,
    tenancychoice: bool | None = None,
    tenancyfee: float | None = None,
    tenancycurrency: str | None = None,
    referalchoice: bool | None = None,
    referalcommissionvalue: float | None = None,
    referral_type: str | None = None,
    referral_ringfence: bool | None = None,
    referrals: list[dict] | None = None,
    iscpa_capping: bool | None = None,
    cpa_capping_duration: str | None = None,
    cpa_capping_limit: int | None = None,
    iscpl_capping: bool | None = None,
    cpl_capping_duration: str | None = None,
    cpl_capping_limit: int | None = None,
    iscpc_capping: bool | None = None,
    cpc_capping_duration: str | None = None,
    cpc_capping_limit: int | None = None,
    iscpi_capping: bool | None = None,
    cpi_capping_duration: str | None = None,
    cpi_capping_limit: int | None = None,
    is_track_history: bool | None = None,
    wagercriteriavalue: float | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    notes: str | None = None,
    month_to_date: bool | None = None,
    pocdeduction: bool | None = None,
    mastercommission_id: int | None = None,
    country: list[int] | None = None,
) -> str:
    """Create a commission (Admin only).

    Args:
        comm_type: Commission type (required).
        program_id: Affiliate programme ID.
        affiliate_id: Scope to a specific affiliate.
        site_id: Site/brand ID.
        campaign_id: Campaign ID.
        product_id: Product ID.
        revshare: Enable revenue share.
        revsharepercent: RevShare percentage.
        revtype: Revenue type string.
        ringfence: Enable ringfencing.
        cpachoice: Enable CPA.
        criteriaacquisition: Acquisition criteria string.
        criteriavalue: Criteria value.
        cpacommissionvalue: CPA commission value.
        currency: Currency code.
        cpacumulative: Cumulative CPA flag.
        exclude_rev: Exclude revenue flag.
        tierchoice: Enable tiered commission.
        tiertype: Tier type string.
        tier_ringfence: Tier ringfence flag.
        tier_brackets: List of {"percent", "from", "to"} dicts.
        cplchoice: Enable CPL.
        cplcommissionvalue: CPL commission value.
        cplcurrency: CPL currency.
        cpcchoice: Enable CPC.
        cpccommissionvalue: CPC commission value.
        cpccurrency: CPC currency.
        cpichoice: Enable CPI.
        cpicommissionvalue: CPI commission value.
        cpicurrency: CPI currency.
        tenancychoice: Enable tenancy fee.
        tenancyfee: Tenancy fee amount.
        tenancycurrency: Tenancy currency.
        referalchoice: Enable referral commission.
        referalcommissionvalue: Referral commission value.
        referral_type: Referral type string.
        referral_ringfence: Referral ringfence flag.
        referrals: List of {"affiliate_id", "type", "commission"} dicts.
        iscpa_capping: Enable CPA capping.
        cpa_capping_duration: "Month on month" or "Lifetime".
        cpa_capping_limit: CPA cap limit.
        iscpl_capping: Enable CPL capping.
        cpl_capping_duration: "Month on month" or "Lifetime".
        cpl_capping_limit: CPL cap limit.
        iscpc_capping: Enable CPC capping.
        cpc_capping_duration: "Month on month" or "Lifetime".
        cpc_capping_limit: CPC cap limit.
        iscpi_capping: Enable CPI capping.
        cpi_capping_duration: "Month on month" or "Lifetime".
        cpi_capping_limit: CPI cap limit.
        is_track_history: Snapshot before updating.
        wagercriteriavalue: Wager criteria value.
        start_date: Commission start date DD-MM-YYYY.
        end_date: Commission end date DD-MM-YYYY.
        notes: Notes string.
        month_to_date: Month-to-date flag.
        pocdeduction: POC deduction flag.
        mastercommission_id: Master commission ID.
        country: List of country IDs.
    """
    return await _post(
        "/commissions/",
        {
            "comm_type": comm_type,
            "program_id": program_id,
            "affiliate_id": affiliate_id,
            "site_id": site_id,
            "campaign_id": campaign_id,
            "product_id": product_id,
            "revshare": revshare,
            "revsharepercent": revsharepercent,
            "revtype": revtype,
            "ringfence": ringfence,
            "cpachoice": cpachoice,
            "criteriaacquisition": criteriaacquisition,
            "criteriavalue": criteriavalue,
            "cpacommissionvalue": cpacommissionvalue,
            "currency": currency,
            "cpacumulative": cpacumulative,
            "exclude_rev": exclude_rev,
            "tierchoice": tierchoice,
            "tiertype": tiertype,
            "tier_ringfence": tier_ringfence,
            "tier_brackets": tier_brackets,
            "cplchoice": cplchoice,
            "cplcommissionvalue": cplcommissionvalue,
            "cplcurrency": cplcurrency,
            "cpcchoice": cpcchoice,
            "cpccommissionvalue": cpccommissionvalue,
            "cpccurrency": cpccurrency,
            "cpichoice": cpichoice,
            "cpicommissionvalue": cpicommissionvalue,
            "cpicurrency": cpicurrency,
            "tenancychoice": tenancychoice,
            "tenancyfee": tenancyfee,
            "tenancycurrency": tenancycurrency,
            "referalchoice": referalchoice,
            "referalcommissionvalue": referalcommissionvalue,
            "referral_type": referral_type,
            "referral_ringfence": referral_ringfence,
            "referrals": referrals,
            "iscpa_capping": iscpa_capping,
            "cpa_capping_duration": cpa_capping_duration,
            "cpa_capping_limit": cpa_capping_limit,
            "iscpl_capping": iscpl_capping,
            "cpl_capping_duration": cpl_capping_duration,
            "cpl_capping_limit": cpl_capping_limit,
            "iscpc_capping": iscpc_capping,
            "cpc_capping_duration": cpc_capping_duration,
            "cpc_capping_limit": cpc_capping_limit,
            "iscpi_capping": iscpi_capping,
            "cpi_capping_duration": cpi_capping_duration,
            "cpi_capping_limit": cpi_capping_limit,
            "is_track_history": is_track_history,
            "wagercriteriavalue": wagercriteriavalue,
            "start_date": start_date,
            "end_date": end_date,
            "notes": notes,
            "month_to_date": month_to_date,
            "pocdeduction": pocdeduction,
            "mastercommission_id": mastercommission_id,
            "country": country,
        },
    )


@mcp.tool()
async def search_commission_conflicts(
    comm_type: str,
    program_id: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    aff_id: int | None = None,
    brand: list[int] | None = None,
    product: list[int] | None = None,
    campaign: int | None = None,
    country: list[int] | None = None,
    id: int | None = None,
) -> str:
    """Check for overlapping/conflicting commissions (Admin only).

    Returns a list of conflicting commissions. An empty list means no conflicts.

    Args:
        comm_type: Commission type to check (required).
        program_id: Affiliate programme ID.
        start_date: Range start date DD-MM-YYYY.
        end_date: Range end date DD-MM-YYYY.
        aff_id: Affiliate ID to scope the check.
        brand: List of site/brand IDs.
        product: List of product IDs.
        campaign: Campaign ID.
        country: List of country IDs.
        id: Current commission ID to exclude when editing.
    """
    return await _post(
        "/commissions/search/",
        {
            "comm_type": comm_type,
            "program_id": program_id,
            "start_date": start_date,
            "end_date": end_date,
            "aff_id": aff_id,
            "brand": brand,
            "product": product,
            "campaign": campaign,
            "country": country,
            "id": id,
        },
    )


@mcp.tool()
async def get_commission(commission_id: str, program_id: int | None = None) -> str:
    """Return full commission detail including history and referrals (Admin only).

    Args:
        commission_id: The commission's ID.
        program_id: Affiliate programme ID (optional).
    """
    return await _get(f"/commissions/{commission_id}/", {"program_id": program_id})


@mcp.tool()
async def update_commission(
    commission_id: str,
    is_track_history: bool | None = None,
    comm_type: str | None = None,
    program_id: int | None = None,
    affiliate_id: int | None = None,
    site_id: int | None = None,
    campaign_id: int | None = None,
    product_id: int | None = None,
    revshare: bool | None = None,
    revsharepercent: float | None = None,
    revtype: str | None = None,
    ringfence: bool | None = None,
    cpachoice: bool | None = None,
    criteriaacquisition: str | None = None,
    criteriavalue: float | None = None,
    cpacommissionvalue: float | None = None,
    currency: str | None = None,
    cpacumulative: bool | None = None,
    exclude_rev: bool | None = None,
    tierchoice: bool | None = None,
    tiertype: str | None = None,
    tier_ringfence: bool | None = None,
    tier_brackets: list[dict] | None = None,
    cplchoice: bool | None = None,
    cplcommissionvalue: float | None = None,
    cplcurrency: str | None = None,
    cpcchoice: bool | None = None,
    cpccommissionvalue: float | None = None,
    cpccurrency: str | None = None,
    cpichoice: bool | None = None,
    cpicommissionvalue: float | None = None,
    cpicurrency: str | None = None,
    tenancychoice: bool | None = None,
    tenancyfee: float | None = None,
    tenancycurrency: str | None = None,
    referalchoice: bool | None = None,
    referalcommissionvalue: float | None = None,
    referral_type: str | None = None,
    referral_ringfence: bool | None = None,
    referrals: list[dict] | None = None,
    iscpa_capping: bool | None = None,
    cpa_capping_duration: str | None = None,
    cpa_capping_limit: int | None = None,
    iscpl_capping: bool | None = None,
    cpl_capping_duration: str | None = None,
    cpl_capping_limit: int | None = None,
    iscpc_capping: bool | None = None,
    cpc_capping_duration: str | None = None,
    cpc_capping_limit: int | None = None,
    iscpi_capping: bool | None = None,
    cpi_capping_duration: str | None = None,
    cpi_capping_limit: int | None = None,
    wagercriteriavalue: float | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    notes: str | None = None,
    month_to_date: bool | None = None,
    pocdeduction: bool | None = None,
    mastercommission_id: int | None = None,
    country: list[int] | None = None,
) -> str:
    """Replace (PUT) an existing commission. Pass is_track_history=True to snapshot before updating (Admin only).

    Args:
        commission_id: The commission's ID.
        is_track_history: Snapshot current state before updating.
        comm_type: Commission type.
        program_id: Affiliate programme ID.
        (All other args are the same as create_commission.)
    """
    return await _put(
        f"/commissions/{commission_id}/",
        {
            "is_track_history": is_track_history,
            "comm_type": comm_type,
            "program_id": program_id,
            "affiliate_id": affiliate_id,
            "site_id": site_id,
            "campaign_id": campaign_id,
            "product_id": product_id,
            "revshare": revshare,
            "revsharepercent": revsharepercent,
            "revtype": revtype,
            "ringfence": ringfence,
            "cpachoice": cpachoice,
            "criteriaacquisition": criteriaacquisition,
            "criteriavalue": criteriavalue,
            "cpacommissionvalue": cpacommissionvalue,
            "currency": currency,
            "cpacumulative": cpacumulative,
            "exclude_rev": exclude_rev,
            "tierchoice": tierchoice,
            "tiertype": tiertype,
            "tier_ringfence": tier_ringfence,
            "tier_brackets": tier_brackets,
            "cplchoice": cplchoice,
            "cplcommissionvalue": cplcommissionvalue,
            "cplcurrency": cplcurrency,
            "cpcchoice": cpcchoice,
            "cpccommissionvalue": cpccommissionvalue,
            "cpccurrency": cpccurrency,
            "cpichoice": cpichoice,
            "cpicommissionvalue": cpicommissionvalue,
            "cpicurrency": cpicurrency,
            "tenancychoice": tenancychoice,
            "tenancyfee": tenancyfee,
            "tenancycurrency": tenancycurrency,
            "referalchoice": referalchoice,
            "referalcommissionvalue": referalcommissionvalue,
            "referral_type": referral_type,
            "referral_ringfence": referral_ringfence,
            "referrals": referrals,
            "iscpa_capping": iscpa_capping,
            "cpa_capping_duration": cpa_capping_duration,
            "cpa_capping_limit": cpa_capping_limit,
            "iscpl_capping": iscpl_capping,
            "cpl_capping_duration": cpl_capping_duration,
            "cpl_capping_limit": cpl_capping_limit,
            "iscpc_capping": iscpc_capping,
            "cpc_capping_duration": cpc_capping_duration,
            "cpc_capping_limit": cpc_capping_limit,
            "iscpi_capping": iscpi_capping,
            "cpi_capping_duration": cpi_capping_duration,
            "cpi_capping_limit": cpi_capping_limit,
            "wagercriteriavalue": wagercriteriavalue,
            "start_date": start_date,
            "end_date": end_date,
            "notes": notes,
            "month_to_date": month_to_date,
            "pocdeduction": pocdeduction,
            "mastercommission_id": mastercommission_id,
            "country": country,
        },
    )


# ---------------------------------------------------------------------------
# Bonus codes
# ---------------------------------------------------------------------------

@mcp.tool()
async def list_bonus_codes(
    program_id: int | None = None,
    brand: int | None = None,
    affiliate: int | None = None,
) -> str:
    """List bonus codes (Admin only).

    Args:
        program_id: Scope results to a specific programme.
        brand: Filter by site/brand ID.
        affiliate: Filter by affiliate ID.
    """
    return await _get(
        "/bonus-codes/",
        {"program_id": program_id, "brand": brand, "affiliate": affiliate},
    )


@mcp.tool()
async def create_bonus_code(
    siteid: int,
    affiliateid: int,
    bonuscode: str,
    campaignname: str,
    program_id: int | None = None,
) -> str:
    """Create a bonus code (Admin only).

    Args:
        siteid: Site/brand ID (required).
        affiliateid: Affiliate ID (required).
        bonuscode: The bonus code string (required).
        campaignname: Campaign name for this code (required).
        program_id: Programme ID (optional).
    """
    return await _post(
        "/bonus-codes/",
        {
            "siteid": siteid,
            "affiliateid": affiliateid,
            "bonuscode": bonuscode,
            "campaignname": campaignname,
            "program_id": program_id,
        },
    )


@mcp.tool()
async def delete_bonus_code(bonus_code_id: str, program_id: int | None = None) -> str:
    """Delete a bonus code (Admin only). Blocked if the campaign is in use by a tracking link.

    Args:
        bonus_code_id: The BonusCode ID to delete.
        program_id: Programme ID; validates the bonus code belongs to this programme.
    """
    return await _delete(f"/bonus-codes/{bonus_code_id}/", {"program_id": program_id})


# ---------------------------------------------------------------------------
# AI API settings
# ---------------------------------------------------------------------------

@mcp.tool()
async def get_ai_api_settings(program_id: int) -> str:
    """Return the AI API provider list and model list for a given programme.

    Args:
        program_id: Affiliate programme ID (required).
    """
    return await _get("/ai_api_settings", {"program_id": program_id})


# ---------------------------------------------------------------------------
# Bonus service helpers (no auth required for back-office routes)
# ---------------------------------------------------------------------------

async def _bonus_get(path: str, params: dict[str, Any] | None = None) -> str:
    params = {k: v for k, v in (params or {}).items() if v is not None}
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BONUS_BASE_URL}{path}", params=params, timeout=30)
        return r.text


async def _bonus_post(path: str, body: dict[str, Any]) -> str:
    payload = {k: v for k, v in body.items() if v is not None}
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BONUS_BASE_URL}{path}", json=payload, timeout=30)
        return r.text


async def _bonus_patch(path: str, body: dict[str, Any]) -> str:
    payload = {k: v for k, v in body.items() if v is not None}
    async with httpx.AsyncClient() as client:
        r = await client.patch(f"{BONUS_BASE_URL}{path}", json=payload, timeout=30)
        return r.text


async def _bonus_put(path: str, body: dict[str, Any]) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.put(f"{BONUS_BASE_URL}{path}", json=body, timeout=30)
        return r.text


# ---------------------------------------------------------------------------
# Bonus — Summary
# ---------------------------------------------------------------------------

@mcp.tool()
async def bonus_get_summary(site_id: int) -> str:
    """Return KPI counts and monthly budget summary for a site.

    Args:
        site_id: Site ID to summarise.
    """
    return await _bonus_get("/bonus-summary", {"site_id": site_id})


# ---------------------------------------------------------------------------
# Bonus — Brands & Users
# ---------------------------------------------------------------------------

@mcp.tool()
async def bonus_list_brands(user_id: int) -> str:
    """Return brands available to the logged-in user (served by auth-service).

    Args:
        user_id: The user's ID.
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{AUTH_BASE_URL}/v1/brands", params={"user_id": user_id}, timeout=30)
        return r.text


@mcp.tool()
async def bonus_list_users() -> str:
    """Return the list of back-office users (served by auth-service)."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{AUTH_BASE_URL}/v1/users", timeout=30)
        return r.text


# ---------------------------------------------------------------------------
# Bonus — Heads
# ---------------------------------------------------------------------------

@mcp.tool()
async def bonus_list_heads(site_id: int) -> str:
    """Return all bonus heads for a site.

    Args:
        site_id: Site ID to filter by.
    """
    return await _bonus_get("/bonus-heads", {"site_id": site_id})


@mcp.tool()
async def bonus_get_head(head_id: int) -> str:
    """Return a bonus head with its owners, subheads, and budget detail.

    Args:
        head_id: Bonus head ID.
    """
    return await _bonus_get(f"/bonus-heads/{head_id}")


@mcp.tool()
async def bonus_create_head(
    site_id: int,
    name: str,
    owner: str,
    created_by: str,
    description: str | None = None,
    active: bool = True,
) -> str:
    """Create a new bonus head.

    Args:
        site_id: Site this bonus head belongs to (required).
        name: Unique name within the site, alphanumeric + space/hyphen/underscore/dot (required).
        owner: Primary accountable person — username or email (required).
        created_by: Actor performing the creation (required).
        description: Optional free-text description (max 500 chars).
        active: Whether this head is active (default true).
    """
    return await _bonus_post(
        "/bonus-heads",
        {"site_id": site_id, "name": name, "owner": owner, "created_by": created_by,
         "description": description, "active": active},
    )


@mcp.tool()
async def bonus_patch_head(
    head_id: int,
    updated_by: str,
    name: str | None = None,
    description: str | None = None,
    active: bool | None = None,
    owner: str | None = None,
) -> str:
    """Partially update a bonus head. Only provided fields are written.

    Args:
        head_id: Bonus head ID (required).
        updated_by: Actor performing the update (required).
        name: New name.
        description: New description (pass null to clear).
        active: New active flag.
        owner: New owner username/email.
    """
    return await _bonus_patch(
        f"/bonus-heads/{head_id}",
        {"updated_by": updated_by, "name": name, "description": description,
         "active": active, "owner": owner},
    )


@mcp.tool()
async def bonus_upsert_head_owners(head_id: int, owners_json: str) -> str:
    """Add or update owner assignments for a bonus head.

    Args:
        head_id: Bonus head ID (required).
        owners_json: JSON string with "owners" list and "updated_by", e.g.
            '{"owners": [{"username": "alice", "role": "OPS_LEAD", "active": true}], "updated_by": "admin"}'.
            Role must be one of: OPS_LEAD, CAMPAIGN_MANAGER, FINANCE_APPROVER, ESCALATION_CONTACT.
    """
    return await _bonus_put(f"/bonus-heads/{head_id}/owners", json.loads(owners_json))


@mcp.tool()
async def bonus_upsert_head_limits(head_id: int, limits_json: str) -> str:
    """Set or update budget caps for a bonus head.

    Args:
        head_id: Bonus head ID (required).
        limits_json: JSON string with "limits" list and "updated_by", e.g.
            '{"limits": [{"period_type": "MONTHLY", "budget_limit": 50000}], "updated_by": "admin"}'.
            period_type must be one of: DAILY, WEEKLY, MONTHLY. Pass null for budget_limit to uncap.
    """
    return await _bonus_put(f"/bonus-heads/{head_id}/limits", json.loads(limits_json))


# ---------------------------------------------------------------------------
# Bonus — Subheads
# ---------------------------------------------------------------------------

@mcp.tool()
async def bonus_create_subhead(
    head_id: int,
    site_id: int,
    name: str,
    owner: str,
    created_by: str,
    description: str | None = None,
    active: bool = True,
) -> str:
    """Create a new bonus subhead under an existing bonus head.

    Args:
        head_id: Parent bonus head ID (required).
        site_id: Site ID (required).
        name: Unique name within the parent head (required).
        owner: Primary accountable person (required).
        created_by: Actor performing the creation (required).
        description: Optional free-text description.
        active: Whether active (default true).
    """
    return await _bonus_post(
        "/bonus-subheads",
        {"head_id": head_id, "site_id": site_id, "name": name, "owner": owner,
         "created_by": created_by, "description": description, "active": active},
    )


@mcp.tool()
async def bonus_get_subhead(subhead_id: int) -> str:
    """Return a bonus subhead with its owners and budget detail.

    Args:
        subhead_id: Bonus subhead ID.
    """
    return await _bonus_get(f"/bonus-subheads/{subhead_id}")


@mcp.tool()
async def bonus_patch_subhead(
    subhead_id: int,
    updated_by: str,
    name: str | None = None,
    description: str | None = None,
    active: bool | None = None,
    owner: str | None = None,
) -> str:
    """Partially update a bonus subhead. Only provided fields are written.

    Args:
        subhead_id: Bonus subhead ID (required).
        updated_by: Actor performing the update (required).
        name: New name.
        description: New description (pass null to clear).
        active: New active flag.
        owner: New owner username/email.
    """
    return await _bonus_patch(
        f"/bonus-subheads/{subhead_id}",
        {"updated_by": updated_by, "name": name, "description": description,
         "active": active, "owner": owner},
    )


@mcp.tool()
async def bonus_upsert_subhead_owners(subhead_id: int, owners_json: str) -> str:
    """Add or update owner assignments for a bonus subhead.

    Args:
        subhead_id: Bonus subhead ID (required).
        owners_json: JSON string with "owners" list and "updated_by". Same format as bonus_upsert_head_owners.
    """
    return await _bonus_put(f"/bonus-subheads/{subhead_id}/owners", json.loads(owners_json))


@mcp.tool()
async def bonus_upsert_subhead_limits(subhead_id: int, limits_json: str) -> str:
    """Set or update budget caps for a bonus subhead.

    Args:
        subhead_id: Bonus subhead ID (required).
        limits_json: JSON string with "limits" list and "updated_by". Same format as bonus_upsert_head_limits.
    """
    return await _bonus_put(f"/bonus-subheads/{subhead_id}/limits", json.loads(limits_json))


# ---------------------------------------------------------------------------
# Bonus — Configures
# ---------------------------------------------------------------------------

@mcp.tool()
async def bonus_list_configures(subhead_id: int) -> str:
    """List all bonus configure nodes for a given subhead, ordered by priority then id.

    Args:
        subhead_id: Parent subhead ID.
    """
    return await _bonus_get("/bonus-configures", {"subhead_id": subhead_id})


@mcp.tool()
async def bonus_get_configure(configure_id: int) -> str:
    """Return a bonus configure node with all its attached promo codes.

    Args:
        configure_id: Bonus configure ID.
    """
    return await _bonus_get(f"/bonus-configures/{configure_id}")


@mcp.tool()
async def bonus_create_configure(
    subhead_id: int,
    site_id: int,
    name: str,
    start_date: str,
    end_date: str,
    created_by: str,
    description: str | None = None,
    applicability_frequency: str = "EVERYTIME",
    wager_multiplier: float = 0.0,
    no_of_chunks: int = 1,
    release_bucket: str | None = None,
    chunk_expiry_days: int | None = None,
    bonus_expiry_days: int | None = None,
    wager_chip_type: str = "CASH",
    credit_chip_type: str = "CASH",
    bonus_amount_fixed: float | None = None,
    bonus_amount_percent: float | None = None,
    bonus_amount_max: float | None = None,
    priority: int = 0,
    active: bool = True,
) -> str:
    """Create a new bonus configure node under an existing subhead.

    A default promo code (AUTO-{id}) is automatically created alongside it.

    Args:
        subhead_id: Parent subhead ID (required).
        site_id: Site ID (required).
        name: Unique name within the subhead (required).
        start_date: Active window start as ISO datetime string, e.g. "2025-01-01T00:00:00" (required).
        end_date: Active window end as ISO datetime string, e.g. "2025-12-31T23:59:59" (required).
        created_by: Actor performing the creation (required).
        description: Optional free-text description.
        applicability_frequency: EVERYTIME (default), ONCE, MONTHLY, or WEEKLY.
        wager_multiplier: Wager requirement multiplier; 0 = no wagering (default 0).
        no_of_chunks: Number of equal bonus chunks (default 1).
        release_bucket: Optional release bucket identifier.
        chunk_expiry_days: Days until each chunk expires (optional).
        bonus_expiry_days: Days until the whole bonus expires (optional).
        wager_chip_type: Chip type for wagering (default CASH).
        credit_chip_type: Chip type for crediting (default CASH).
        bonus_amount_fixed: Fixed bonus amount (optional).
        bonus_amount_percent: Bonus as a percentage of trigger amount (optional).
        bonus_amount_max: Maximum bonus amount cap (optional).
        priority: Priority for ordering (default 0, lower = higher priority).
        active: Whether active (default true).
    """
    return await _bonus_post(
        "/bonus-configures",
        {
            "subhead_id": subhead_id, "site_id": site_id, "name": name,
            "start_date": start_date, "end_date": end_date, "created_by": created_by,
            "description": description, "applicability_frequency": applicability_frequency,
            "wager_multiplier": wager_multiplier, "no_of_chunks": no_of_chunks,
            "release_bucket": release_bucket, "chunk_expiry_days": chunk_expiry_days,
            "bonus_expiry_days": bonus_expiry_days, "wager_chip_type": wager_chip_type,
            "credit_chip_type": credit_chip_type, "bonus_amount_fixed": bonus_amount_fixed,
            "bonus_amount_percent": bonus_amount_percent, "bonus_amount_max": bonus_amount_max,
            "priority": priority, "active": active,
        },
    )


@mcp.tool()
async def bonus_patch_configure(
    configure_id: int,
    updated_by: str,
    name: str | None = None,
    description: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    applicability_frequency: str | None = None,
    wager_multiplier: float | None = None,
    no_of_chunks: int | None = None,
    release_bucket: str | None = None,
    chunk_expiry_days: int | None = None,
    bonus_expiry_days: int | None = None,
    wager_chip_type: str | None = None,
    credit_chip_type: str | None = None,
    bonus_amount_fixed: float | None = None,
    bonus_amount_percent: float | None = None,
    bonus_amount_max: float | None = None,
    priority: int | None = None,
    active: bool | None = None,
) -> str:
    """Partially update a bonus configure node. Only provided fields are written.

    Args:
        configure_id: Bonus configure ID (required).
        updated_by: Actor performing the update (required).
        name: New name.
        description: New description.
        start_date: New start date ISO string.
        end_date: New end date ISO string.
        applicability_frequency: EVERYTIME, ONCE, MONTHLY, or WEEKLY.
        wager_multiplier: New wager multiplier.
        no_of_chunks: New chunk count.
        release_bucket: New release bucket.
        chunk_expiry_days: New chunk expiry days.
        bonus_expiry_days: New bonus expiry days.
        wager_chip_type: New wager chip type.
        credit_chip_type: New credit chip type.
        bonus_amount_fixed: New fixed amount.
        bonus_amount_percent: New percent amount.
        bonus_amount_max: New max amount cap.
        priority: New priority.
        active: New active flag.
    """
    return await _bonus_patch(
        f"/bonus-configures/{configure_id}",
        {
            "updated_by": updated_by, "name": name, "description": description,
            "start_date": start_date, "end_date": end_date,
            "applicability_frequency": applicability_frequency,
            "wager_multiplier": wager_multiplier, "no_of_chunks": no_of_chunks,
            "release_bucket": release_bucket, "chunk_expiry_days": chunk_expiry_days,
            "bonus_expiry_days": bonus_expiry_days, "wager_chip_type": wager_chip_type,
            "credit_chip_type": credit_chip_type, "bonus_amount_fixed": bonus_amount_fixed,
            "bonus_amount_percent": bonus_amount_percent, "bonus_amount_max": bonus_amount_max,
            "priority": priority, "active": active,
        },
    )


# ---------------------------------------------------------------------------
# Bonus — Release Triggers
# ---------------------------------------------------------------------------

@mcp.tool()
async def bonus_get_release_trigger(trigger_id: int) -> str:
    """Return a single bonus release trigger by ID.

    Args:
        trigger_id: Release trigger ID.
    """
    return await _bonus_get(f"/bonus-release-triggers/{trigger_id}")


@mcp.tool()
async def bonus_create_release_trigger(
    site_id: int,
    code: str,
    trigger_type: str,
    created_by: str,
    description: str | None = None,
    min_trigger_amount: float | None = None,
    max_trigger_amount: float | None = None,
    payment_method: str | None = None,
    product: str | None = None,
    occurrence: int = 0,
    trigger_config_json: str | None = None,
    active: bool = True,
) -> str:
    """Create a release trigger for a bonus configure, resolved via promo code.

    Args:
        site_id: Site ID (required).
        code: Promo code that resolves to the parent bonus_configure, e.g. "FIRST_DEPOSIT" (required).
        trigger_type: One of LOGIN, REGISTRATION, APP_VISIT, DEPOSIT, BET_PLACED,
            LEADERBOARD_WON, TOURNAMENT_WON, FRIEND_SIGNUP (required).
        created_by: Actor performing the creation (required).
        description: Optional description.
        min_trigger_amount: Minimum qualifying amount (optional).
        max_trigger_amount: Maximum qualifying amount (optional).
        payment_method: Restrict to a payment method, e.g. "UPI" (optional).
        product: Restrict to a product, e.g. "CASINO" (optional).
        occurrence: 0 = every event, 1 = first only, N = Nth occurrence (default 0).
        trigger_config_json: Optional JSON string of additional conditions, e.g. '{"min_deposit": 100}'.
        active: Whether active (default true).
    """
    return await _bonus_post(
        "/bonus-release-triggers",
        {
            "site_id": site_id, "code": code, "trigger_type": trigger_type,
            "created_by": created_by, "description": description,
            "min_trigger_amount": min_trigger_amount, "max_trigger_amount": max_trigger_amount,
            "payment_method": payment_method, "product": product, "occurrence": occurrence,
            "trigger_config": json.loads(trigger_config_json) if trigger_config_json else None,
            "active": active,
        },
    )


@mcp.tool()
async def bonus_patch_release_trigger(
    trigger_id: int,
    updated_by: str,
    trigger_type: str | None = None,
    description: str | None = None,
    min_trigger_amount: float | None = None,
    max_trigger_amount: float | None = None,
    payment_method: str | None = None,
    product: str | None = None,
    occurrence: int | None = None,
    trigger_config_json: str | None = None,
    active: bool | None = None,
) -> str:
    """Partially update a bonus release trigger. Only provided fields are written.

    Args:
        trigger_id: Release trigger ID (required).
        updated_by: Actor performing the update (required).
        trigger_type: New trigger type.
        description: New description.
        min_trigger_amount: New minimum qualifying amount.
        max_trigger_amount: New maximum qualifying amount.
        payment_method: New payment method restriction.
        product: New product restriction.
        occurrence: New occurrence value.
        trigger_config_json: New trigger config as JSON string (full replacement).
        active: New active flag.
    """
    return await _bonus_patch(
        f"/bonus-release-triggers/{trigger_id}",
        {
            "updated_by": updated_by, "trigger_type": trigger_type,
            "description": description, "min_trigger_amount": min_trigger_amount,
            "max_trigger_amount": max_trigger_amount, "payment_method": payment_method,
            "product": product, "occurrence": occurrence,
            "trigger_config": json.loads(trigger_config_json) if trigger_config_json else None,
            "active": active,
        },
    )


# ---------------------------------------------------------------------------
# Bonus — Eligibilities
# ---------------------------------------------------------------------------

@mcp.tool()
async def bonus_get_eligibility(eligibility_id: int) -> str:
    """Return a single bonus eligibility criterion row.

    Args:
        eligibility_id: Eligibility criterion ID.
    """
    return await _bonus_get(f"/bonus-eligibilities/{eligibility_id}")


@mcp.tool()
async def bonus_create_eligibility(
    configure_id: int,
    site_id: int,
    eligibility_key: str,
    eligibility_value: str,
    eligibility_value_type: str,
    created_by: str,
    description: str | None = None,
    active: bool = True,
) -> str:
    """Create one eligibility criterion for a bonus configure node.

    Multiple rows on the same configure are AND-ed together (all must pass).

    Args:
        configure_id: Parent bonus_configure ID (required).
        site_id: Site ID (required).
        eligibility_key: Criterion name, e.g. "player_registered_period", "player_type",
            "kyc_status", "min_lifetime_deposits" (required).
        eligibility_value: Criterion value as a string (required).
        eligibility_value_type: STRING, INT, DECIMAL, BOOLEAN, or JSON (required).
        created_by: Actor performing the creation (required).
        description: Human-readable summary of this criterion (optional).
        active: Whether active (default true).
    """
    return await _bonus_post(
        "/bonus-eligibilities",
        {
            "configure_id": configure_id, "site_id": site_id,
            "eligibility_key": eligibility_key, "eligibility_value": eligibility_value,
            "eligibility_value_type": eligibility_value_type, "created_by": created_by,
            "description": description, "active": active,
        },
    )


@mcp.tool()
async def bonus_patch_eligibility(
    eligibility_id: int,
    updated_by: str,
    eligibility_key: str | None = None,
    eligibility_value: str | None = None,
    eligibility_value_type: str | None = None,
    description: str | None = None,
    active: bool | None = None,
) -> str:
    """Partially update a bonus eligibility criterion. Only provided fields are written.

    Args:
        eligibility_id: Eligibility criterion ID (required).
        updated_by: Actor performing the update (required).
        eligibility_key: New criterion key.
        eligibility_value: New criterion value.
        eligibility_value_type: New value type (STRING, INT, DECIMAL, BOOLEAN, JSON).
        description: New description.
        active: New active flag.
    """
    return await _bonus_patch(
        f"/bonus-eligibilities/{eligibility_id}",
        {
            "updated_by": updated_by, "eligibility_key": eligibility_key,
            "eligibility_value": eligibility_value,
            "eligibility_value_type": eligibility_value_type,
            "description": description, "active": active,
        },
    )


# ---------------------------------------------------------------------------
# Bonus — Player Bonuses (S2S auth required in production)
# ---------------------------------------------------------------------------

@mcp.tool()
async def bonus_get_applicable_codes(user_id: str, chip_type: str) -> str:
    """Return bonus codes applicable to a player for a given chip type.

    Args:
        user_id: Player user ID (required).
        chip_type: "cash" or "in_app_purchase" (required).
    """
    return await _bonus_get("/player-bonuses/applicable-codes", {"user_id": user_id, "chip_type": chip_type})


@mcp.tool()
async def bonus_player_summary(user_id: str) -> str:
    """Return a player's current bonus balance summary (per chip type).

    Args:
        user_id: Player user ID.
    """
    return await _bonus_get(f"/player-bonuses/{user_id}/summary")


@mcp.tool()
async def bonus_player_transactions(
    user_id: str,
    chip_type: str,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Return a paginated list of a player's bonus transactions.

    Args:
        user_id: Player user ID (required).
        chip_type: "cash" or "in_app_purchase" (required).
        limit: Max results to return (1–200, default 50).
        offset: Pagination offset (default 0).
    """
    return await _bonus_get(
        f"/player-bonuses/{user_id}/transactions",
        {"chip_type": chip_type, "limit": limit, "offset": offset},
    )


@mcp.tool()
async def bonus_player_transaction_detail(user_id: str, txn_id: int) -> str:
    """Return full detail for a single player bonus transaction including chunks, forfeits, and expiry events.

    Args:
        user_id: Player user ID (required).
        txn_id: Transaction ID (required).
    """
    return await _bonus_get(f"/player-bonuses/{user_id}/transactions/{txn_id}")


@mcp.tool()
async def bonus_player_referral_code(user_id: str) -> str:
    """Return the referral code for a player.

    Args:
        user_id: Player user ID.
    """
    return await _bonus_get(f"/player-bonuses/{user_id}/referral-code")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    transport = os.environ.get("MCP_TRANSPORT", "streamable-http")
    host = os.environ.get("MCP_HOST", "0.0.0.0")
    port = int(os.environ.get("MCP_PORT", "8082"))

    if transport == "stdio":
        mcp.run(transport="stdio")
    else:
        import uvicorn
        from starlette.middleware.base import BaseHTTPMiddleware

        class _TokenMiddleware(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                auth = request.headers.get("authorization", "")
                token = auth.removeprefix("Bearer ").strip() if auth else request.headers.get("x-wynta-token", "")
                _token_ctx.set(token)
                return await call_next(request)

        app = mcp.streamable_http_app() if transport == "streamable-http" else mcp.sse_app()
        app.add_middleware(_TokenMiddleware)
        uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
