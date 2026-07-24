import { getToken } from "wynta-react-common/services/tokenRegistry";
import { MOCK_CONFIGURES } from "./mocks/configures";
import { getUsage, getBudget, getHistory } from "./mocks/utils";

// const authHeader = () => ({
//   'Content-Type': 'application/json',
//   Authorization: `Bearer ${getToken()}`,
// });

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
import {
  MANUAL_SEGMENTS,
  PAM_USER_FIRST_NAMES,
  PAM_USER_LAST_NAMES,
  PAM_USER_STATES,
  PAM_USER_TIERS,
  PAM_USER_KYC,
  PAM_USER_PRODUCTS,
  PAM_USERS_PAGE_SIZE,
  PAM_USERS_SEARCH_CAP,
} from "./mocks/constants";
import type {
  PAMUser,
  PAMUserPage,
  BonusHead,
  BonusSubhead,
  BonusConfigure,
  PromoCode,
  Trigger,
  EligibilityRule,
  BudgetPeriod,
  Segment,
  OwnerEntry,
  SpendPeriod,
  BonusDashboardSummary,
  BonusDashboardTopBonusesResponse,
  BonusDashboardActivityResponse,
  BonusDashboardAlertsResponse,
  BonusDashboardBudgetHealthResponse,
  DashboardDateWindow,
  BonusPerformanceResponse,
  BudgetSpendResponse,
  PlayerActivityResponse,
  ReportDateRange,
  CustomReportResponse,
} from "../types";

const delay = (ms = 180): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// ── Deterministic player generation ──────────────────────────────────────────

function _strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _seedRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function makePAMUser(segmentId: string, index: number): PAMUser {
  const r = _seedRng(_strHash(segmentId + ":" + index));
  const pick = <T>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const fn = pick(PAM_USER_FIRST_NAMES);
  const ln = pick(PAM_USER_LAST_NAMES);
  const id = 10000 + Math.floor(r() * 89999);
  const name = `${fn} ${ln}`;
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${Math.floor(r() * 99)}@wynta.in`;
  const state = pick(PAM_USER_STATES);
  const tier = pick(PAM_USER_TIERS);
  const kyc = pick(PAM_USER_KYC);
  const lifetimeDep = Math.floor((r() * 200000 + 1000) / 100) * 100;
  const lifetimeWager = Math.round(lifetimeDep * (3 + r() * 8));
  const lifetimeGgr = Math.round(lifetimeWager * (0.03 + r() * 0.07));
  const totalBonuses = Math.floor(r() * 28);
  const sessions7 = Math.floor(r() * 28);
  const daysAgoReg = Math.floor(r() * 720) + 1;
  const daysAgoLogin = Math.floor(r() * 30);
  const product = pick(PAM_USER_PRODUCTS);
  const phone =
    "+91 " +
    (60000 + Math.floor(r() * 39999)) +
    " " +
    (10000 + Math.floor(r() * 89999));
  return {
    id,
    name,
    email,
    phone,
    state,
    country: "India",
    tier,
    kyc,
    lifetimeDep,
    lifetimeWager,
    lifetimeGgr,
    totalBonuses,
    sessions7,
    daysAgoReg,
    daysAgoLogin,
    product,
  };
}

export function makePAMUserById(id: number): PAMUser {
  const r = _seedRng(_strHash("pid:" + id));
  const pick = <T>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const fn = pick(PAM_USER_FIRST_NAMES);
  const ln = pick(PAM_USER_LAST_NAMES);
  const name = `${fn} ${ln}`;
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${Math.floor(r() * 99)}@wynta.in`;
  const lifetimeDep = Math.floor((r() * 200000 + 1000) / 100) * 100;
  const lifetimeWager = Math.round(lifetimeDep * (3 + r() * 8));
  return {
    id,
    name,
    email,
    phone:
      "+91 " +
      (60000 + Math.floor(r() * 39999)) +
      " " +
      (10000 + Math.floor(r() * 89999)),
    state: pick(PAM_USER_STATES),
    country: "India",
    tier: pick(PAM_USER_TIERS),
    kyc: pick(PAM_USER_KYC),
    lifetimeDep,
    lifetimeWager,
    lifetimeGgr: Math.round(lifetimeWager * (0.03 + r() * 0.07)),
    totalBonuses: Math.floor(r() * 28),
    sessions7: Math.floor(r() * 28),
    daysAgoReg: Math.floor(r() * 720) + 1,
    daysAgoLogin: Math.floor(r() * 30),
    product: pick(PAM_USER_PRODUCTS),
  };
}

// Global pool (lazy, capped ~1500) for name/email search
let _GLOBAL_PAM_USER_POOL: PAMUser[] | null = null;
export function getGlobalPAMUserPool(): PAMUser[] {
  if (_GLOBAL_PAM_USER_POOL) return _GLOBAL_PAM_USER_POOL;
  const pool: PAMUser[] = [];
  const seen = new Set<number>();
  for (const s of MANUAL_SEGMENTS) {
    const take = Math.min(80, s.count);
    for (let i = 0; i < take; i++) {
      const p = makePAMUser(s.id, i);
      if (!seen.has(p.id)) {
        seen.add(p.id);
        pool.push(p);
        if (pool.length >= 1500) break;
      }
    }
    if (pool.length >= 1500) break;
  }
  _GLOBAL_PAM_USER_POOL = pool;
  return pool;
}

// ── API ───────────────────────────────────────────────────────────────────────

const BONUS_API =
  (process.env.NEXT_PUBLIC_BONUS_API_URL || "http://localhost:8010") +
  "/api/v1/bonus";

// Dedupe concurrent/repeat getSiteConfigure calls for the same site (e.g. two
// mount effects firing close together) so only one network request goes out.
const _siteConfigureCache = new Map<string, Promise<Record<string, string>>>();

// Same dedup pattern for report fetches — keyed by the full request URL, so
// two mount effects firing close together with identical params collapse
// into one network request instead of double-hitting the report queries.
const _reportCache = new Map<string, Promise<unknown>>();

function _dedupedJsonFetch<T>(url: string, errorMessage: string): Promise<T> {
  const cached = _reportCache.get(url) as Promise<T> | undefined;
  if (cached) return cached;

  const promise = (async () => {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(errorMessage);
    return res.json();
  })();
  promise.finally(() => _reportCache.delete(url));
  _reportCache.set(url, promise);
  return promise;
}

function _dashboardWindowParams(siteId: string | number, window?: DashboardDateWindow): URLSearchParams {
  const params = new URLSearchParams({ site_id: String(siteId) });
  if (window?.windowDays) params.set("window_days", String(window.windowDays));
  if (window?.startDate) params.set("start_date", window.startDate);
  if (window?.endDate) params.set("end_date", window.endDate);
  if (window?.compareStart) params.set("compare_start", window.compareStart);
  if (window?.compareEnd) params.set("compare_end", window.compareEnd);
  return params;
}

export const api = {
  async fetchKpiSnapshot(siteId: string | number) {
    const res = await fetch(`${BONUS_API}/bonus-summary?site_id=${siteId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch bonus summary");
    return res.json();
  },
  async fetchDashboardSummary(
    siteId: string | number, window?: DashboardDateWindow,
  ): Promise<BonusDashboardSummary> {
    const params = _dashboardWindowParams(siteId, window);
    const res = await fetch(`${BONUS_API}/bonus-dashboard/summary?${params}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch dashboard summary");
    return res.json();
  },
  async fetchTopBonuses(
    siteId: string | number, window?: DashboardDateWindow, limit = 10, offset = 0,
  ): Promise<BonusDashboardTopBonusesResponse> {
    const params = _dashboardWindowParams(siteId, window);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const res = await fetch(`${BONUS_API}/bonus-dashboard/top-bonuses?${params}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch top bonuses");
    return res.json();
  },
  async fetchRecentActivity(
    siteId: string | number, limit = 20, offset = 0,
  ): Promise<BonusDashboardActivityResponse> {
    const params = new URLSearchParams({
      site_id: String(siteId), limit: String(limit), offset: String(offset),
    });
    const res = await fetch(`${BONUS_API}/bonus-dashboard/recent-activity?${params}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch recent activity");
    return res.json();
  },
  async fetchDashboardAlerts(siteId: string | number): Promise<BonusDashboardAlertsResponse> {
    const res = await fetch(`${BONUS_API}/bonus-dashboard/alerts?site_id=${siteId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch dashboard alerts");
    return res.json();
  },
  async fetchBudgetHealth(siteId: string | number): Promise<BonusDashboardBudgetHealthResponse> {
    const res = await fetch(`${BONUS_API}/bonus-dashboard/budget-health?site_id=${siteId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch budget health");
    return res.json();
  },
  async fetchBonusPerformanceReport(
    siteId: string | number, range: ReportDateRange, limit = 50, offset = 0,
  ): Promise<BonusPerformanceResponse> {
    const params = new URLSearchParams({
      site_id: String(siteId), start_date: range.startDate, end_date: range.endDate,
      limit: String(limit), offset: String(offset),
    });
    return _dedupedJsonFetch(`${BONUS_API}/reports/bonus-performance?${params}`, "Failed to fetch bonus performance report");
  },
  async fetchBudgetSpendReport(
    siteId: string | number, range: ReportDateRange, limit = 50, offset = 0,
  ): Promise<BudgetSpendResponse> {
    const params = new URLSearchParams({
      site_id: String(siteId), start_date: range.startDate, end_date: range.endDate,
      limit: String(limit), offset: String(offset),
    });
    return _dedupedJsonFetch(`${BONUS_API}/reports/budget-spend?${params}`, "Failed to fetch budget & spend report");
  },
  async fetchPlayerActivityReport(
    siteId: string | number, range: ReportDateRange, search?: string, limit = 50, offset = 0,
  ): Promise<PlayerActivityResponse> {
    const params = new URLSearchParams({
      site_id: String(siteId), start_date: range.startDate, end_date: range.endDate,
      limit: String(limit), offset: String(offset),
    });
    if (search) params.set("search", search);
    return _dedupedJsonFetch(`${BONUS_API}/reports/player-activity?${params}`, "Failed to fetch player activity report");
  },
  async fetchCustomReport(
    siteId: string | number, dimension: string, metrics: string[], status: string,
    range: ReportDateRange, limit = 50, offset = 0,
  ): Promise<CustomReportResponse> {
    const params = new URLSearchParams({
      site_id: String(siteId), dimension, metrics: metrics.join(","), status,
      start_date: range.startDate, end_date: range.endDate,
      limit: String(limit), offset: String(offset),
    });
    return _dedupedJsonFetch(`${BONUS_API}/reports/custom?${params}`, "Failed to fetch custom report");
  },
  getSiteConfigure(siteId: string | number): Promise<Record<string, string>> {
    const key = String(siteId);
    const cached = _siteConfigureCache.get(key);
    if (cached) return cached;

    const promise = (async () => {
      const res = await fetch(`${BONUS_API}/site-configure?site_id=${siteId}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch site configure");
      return res.json();
    })();
    // Only dedupe overlapping calls (e.g. two mount effects firing close
    // together) — drop the cache once settled so a later, independent open
    // of the form still gets a fresh read.
    promise.finally(() => _siteConfigureCache.delete(key));
    _siteConfigureCache.set(key, promise);
    return promise;
  },
  async fetchBonusSpend(entityType: string, entityId: number): Promise<SpendPeriod[]> {
    const res = await fetch(
      `${BONUS_API}/bonus-spend?entity_type=${entityType}&entity_id=${entityId}`,
      { headers: authHeaders() },
    );
    if (!res.ok) throw new Error("Failed to fetch bonus spend");
    return res.json();
  },
  async fetchHeads(siteId: string | number) {
    const res = await fetch(`${BONUS_API}/bonus-heads?site_id=${siteId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch bonus heads");
    return res.json();
  },
  async fetchHead(id: number) {
    const res = await fetch(`${BONUS_API}/bonus-heads/${id}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Bonus head ${id} not found`);
    return res.json();
  },
  async fetchSubhead(id: number) {
    const res = await fetch(`${BONUS_API}/bonus-subheads/${id}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Subhead ${id} not found`);
    return res.json();
  },
  async fetchConfigure(id: number) {
    const res = await fetch(`${BONUS_API}/bonus-configures/${id}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Configure ${id} not found`);
    return res.json();
  },
  async fetchConfigures(subheadId: number) {
    const res = await fetch(
      `${BONUS_API}/bonus-configures?subhead_id=${subheadId}`,
      { headers: authHeaders() },
    );
    if (!res.ok)
      throw new Error(`Failed to fetch configures for subhead ${subheadId}`);
    return res.json();
  },
  async fetchConfigureUsage(id: number) {
    await delay();
    return getUsage("configure", id);
  },
  async fetchCodeUsage(codeId: string | number) {
    await delay();
    return getUsage("code", Number(codeId));
  },
  async fetchHistory(type: string, id: number) {
    if (type === "head") {
      const res = await fetch(`${BONUS_API}/bonus-heads/${id}/history`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to fetch history for head ${id}`);
      return res.json();
    }
    if (type === "subhead") {
      const res = await fetch(`${BONUS_API}/bonus-subheads/${id}/history`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to fetch history for subhead ${id}`);
      return res.json();
    }
    if (type === "configure") {
      const res = await fetch(`${BONUS_API}/bonus-configures/${id}/history`, {
        headers: authHeaders(),
      });
      if (!res.ok)
        throw new Error(`Failed to fetch history for configure ${id}`);
      return res.json();
    }
    await delay();
    return getHistory(type, id);
  },
  async fetchBudget(scope: string, id: number): Promise<BudgetPeriod[]> {
    if (scope === "head") {
      const res = await fetch(`${BONUS_API}/bonus-heads/${id}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to fetch budget for head ${id}`);
      const head = await res.json();
      return (head.budget ?? []) as BudgetPeriod[];
    }
    if (scope === "subhead") {
      const res = await fetch(`${BONUS_API}/bonus-subheads/${id}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to fetch budget for subhead ${id}`);
      const sub = await res.json();
      return (sub.budget ?? []) as BudgetPeriod[];
    }
    if (scope === "configure") {
      const res = await fetch(`${BONUS_API}/bonus-configures/${id}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to fetch budget for configure ${id}`);
      const cfg = await res.json();
      return (cfg.budget ?? []) as BudgetPeriod[];
    }
    await delay();
    return getBudget(scope, id) as BudgetPeriod[];
  },
  async createHead(payload: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-heads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to create bonus head",
      );
    }
    return res.json() as Promise<BonusHead>;
  },
  async updateHead(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-heads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to update bonus head",
      );
    }
    return res.json() as Promise<BonusHead>;
  },
  async createSubhead(parentId: number, payload: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-subheads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ head_id: parentId, ...payload }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to create subhead",
      );
    }
    return res.json() as Promise<BonusSubhead>;
  },
  async updateSubhead(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-subheads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to update subhead",
      );
    }
    return res.json() as Promise<BonusSubhead>;
  },
  async createConfigure(parentId: number, payload: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-configures`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ subhead_id: parentId, ...payload }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to create configure",
      );
    }
    return res.json() as Promise<BonusConfigure>;
  },
  async updateConfigure(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-configures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to update configure",
      );
    }
    return res.json() as Promise<BonusConfigure>;
  },
  async fetchPromoCode(codeId: number) {
    const res = await fetch(`${BONUS_API}/bonus-configure-codes/${codeId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to fetch promo code",
      );
    }
    return res.json() as Promise<PromoCode>;
  },
  async createPromoCode(configureId: number, payload: Record<string, unknown>) {
    const { csv_file, ...rest } = payload as Record<string, unknown> & {
      csv_file?: File | null;
    };
    const body = { configure_id: configureId, ...rest };

    let res: Response;
    if (csv_file instanceof File) {
      const form = new FormData();
      Object.entries(body).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        form.append(key, String(value));
      });
      form.append("csv_file", csv_file);
      res = await fetch(`${BONUS_API}/bonus-configure-codes`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: form,
      });
    } else {
      res = await fetch(`${BONUS_API}/bonus-configure-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        (errBody as { detail?: string }).detail ?? "Failed to create promo code",
      );
    }
    return res.json() as Promise<PromoCode>;
  },
  async updatePromoCode(codeId: number, patch: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-configure-codes/${codeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to update promo code",
      );
    }
    return res.json() as Promise<PromoCode>;
  },
  async createTrigger(configureId: number, payload: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-release-triggers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ configure_id: configureId, ...payload }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to create trigger",
      );
    }
    return res.json() as Promise<Trigger>;
  },
  async updateTrigger(triggerId: number, patch: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-release-triggers/${triggerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to update trigger",
      );
    }
    return res.json() as Promise<Trigger>;
  },
  async deleteTrigger(triggerId: number) {
    const res = await fetch(`${BONUS_API}/bonus-release-triggers/${triggerId}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to delete trigger",
      );
    }
  },
  async createEligibility(
    configureId: number,
    payload: Record<string, unknown>,
  ) {
    const res = await fetch(`${BONUS_API}/bonus-eligibilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ configure_id: configureId, ...payload }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ?? "Failed to create eligibility",
      );
    }
    return res.json() as Promise<EligibilityRule>;
  },
  async updateBudget(
    scope: string,
    id: number,
    periods: BudgetPeriod[],
    updatedBy = "system",
  ): Promise<BudgetPeriod[]> {
    const limits = periods.map((p) => ({
      period_type: p.period_type,
      budget_limit: p.limit != null && p.limit !== "" ? Number(p.limit) : null,
    }));
    if (scope === "head") {
      const res = await fetch(`${BONUS_API}/bonus-heads/${id}/limits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ limits, updated_by: updatedBy }),
      });
      if (!res.ok) throw new Error("Failed to update head budget");
      return res.json() as Promise<BudgetPeriod[]>;
    }
    if (scope === "subhead") {
      const res = await fetch(`${BONUS_API}/bonus-subheads/${id}/limits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ limits, updated_by: updatedBy }),
      });
      if (!res.ok) throw new Error("Failed to update subhead budget");
      return res.json() as Promise<BudgetPeriod[]>;
    }
    if (scope === "configure") {
      const res = await fetch(`${BONUS_API}/bonus-configures/${id}/limits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ limits, updated_by: updatedBy }),
      });
      if (!res.ok) throw new Error("Failed to update configure budget");
      return res.json() as Promise<BudgetPeriod[]>;
    }
    await delay(280);
    return periods;
  },
  async updateOwners(
    scope: "head" | "subhead",
    id: number,
    owners: OwnerEntry[],
    updatedBy = "system",
  ): Promise<OwnerEntry[]> {
    const base = scope === "head" ? "bonus-heads" : "bonus-subheads";
    const res = await fetch(`${BONUS_API}/${base}/${id}/owners`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ owners, updated_by: updatedBy }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as { detail?: unknown }).detail;
      throw new Error(
        typeof detail === "string"
          ? detail
          : `Failed to update ${scope} owners`,
      );
    }
    return res.json() as Promise<OwnerEntry[]>;
  },
  async createManualBonus(subheadId: number, payload: Record<string, unknown>) {
    await delay(280);
    return { id: Date.now(), subhead_id: subheadId, ...payload };
  },
  async issueCodeBonus(payload: Record<string, unknown>) {
    await delay(280);
    return { id: Date.now(), ...payload };
  },
  async fetchSegments() {
    await delay();
    return MANUAL_SEGMENTS;
  },
  async createSegment(payload: Record<string, unknown>) {
    await delay(280);
    const id = Date.now();
    return { id, ...payload } as unknown as Segment;
  },
  async fetchSegmentPAMUsers(
    segmentId: string | number,
    { page = 1, search = "" }: { page?: number; search?: string } = {},
  ): Promise<PAMUserPage> {
    await delay();
    const segment = MANUAL_SEGMENTS.find((s) => s.id === segmentId);
    if (!segment)
      return { players: [], page: 1, pageTotal: 1, total: 0, scopeNote: "" };

    const total = segment.count;
    const q = search.trim().toLowerCase();

    let slice: PAMUser[],
      filteredTotal: number,
      pageTotal: number,
      scopeNote: string;

    if (q) {
      const cap = Math.min(total, PAM_USERS_SEARCH_CAP);
      const searchPool: PAMUser[] = [];
      for (let i = 0; i < cap; i++)
        searchPool.push(makePAMUser(String(segmentId), i));

      const matches = searchPool.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          String(p.id).includes(q) ||
          p.email.toLowerCase().includes(q),
      );
      filteredTotal = matches.length;
      pageTotal = Math.max(1, Math.ceil(filteredTotal / PAM_USERS_PAGE_SIZE));
      const safe = Math.min(page, pageTotal);
      slice = matches.slice(
        (safe - 1) * PAM_USERS_PAGE_SIZE,
        safe * PAM_USERS_PAGE_SIZE,
      );
      scopeNote =
        total > PAM_USERS_SEARCH_CAP
          ? ` · searched first ${PAM_USERS_SEARCH_CAP.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`
          : "";
    } else {
      filteredTotal = total;
      pageTotal = Math.max(1, Math.ceil(total / PAM_USERS_PAGE_SIZE));
      const safe = Math.min(page, pageTotal);
      const startIdx = (safe - 1) * PAM_USERS_PAGE_SIZE;
      const endIdx = Math.min(startIdx + PAM_USERS_PAGE_SIZE, total);
      slice = [];
      for (let i = startIdx; i < endIdx; i++)
        slice.push(makePAMUser(String(segmentId), i));
      scopeNote = "";
    }

    return { players: slice, page, pageTotal, total: filteredTotal, scopeNote };
  },
};
