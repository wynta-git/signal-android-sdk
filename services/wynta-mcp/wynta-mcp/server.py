"""MCP server wrapping the Wynta Mobile Dashboard API."""
import json
import os
from contextvars import ContextVar
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

BASE_URL = "http://localhost:8000/api/v1"

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
