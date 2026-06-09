import { getToken } from "wynta-react-common/services/tokenRegistry";
import { MOCK_HEADS } from "./mocks/heads";
import { MOCK_SUBHEADS } from "./mocks/subheads";
import { MOCK_CONFIGURES } from "./mocks/configures";
import { getUsage, getBudget, getHistory } from "./mocks/utils";

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
import {
  MANUAL_SEGMENTS,
  PLAYER_FIRST_NAMES,
  PLAYER_LAST_NAMES,
  PLAYER_STATES,
  PLAYER_TIERS,
  PLAYER_KYC,
  PLAYER_PRODUCTS,
  PLAYERS_PAGE_SIZE,
  PLAYERS_SEARCH_CAP,
} from "./mocks/constants";
import type {
  Player,
  PlayerPage,
  BonusHead,
  BonusSubhead,
  BonusConfigure,
  PromoCode,
  Trigger,
  EligibilityRule,
  BudgetPeriod,
  Segment,
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

function makePlayer(segmentId: string, index: number): Player {
  const r = _seedRng(_strHash(segmentId + ":" + index));
  const pick = <T>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const fn = pick(PLAYER_FIRST_NAMES);
  const ln = pick(PLAYER_LAST_NAMES);
  const id = 10000 + Math.floor(r() * 89999);
  const name = `${fn} ${ln}`;
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${Math.floor(r() * 99)}@wynta.in`;
  const state = pick(PLAYER_STATES);
  const tier = pick(PLAYER_TIERS);
  const kyc = pick(PLAYER_KYC);
  const lifetimeDep = Math.floor((r() * 200000 + 1000) / 100) * 100;
  const lifetimeWager = Math.round(lifetimeDep * (3 + r() * 8));
  const lifetimeGgr = Math.round(lifetimeWager * (0.03 + r() * 0.07));
  const totalBonuses = Math.floor(r() * 28);
  const sessions7 = Math.floor(r() * 28);
  const daysAgoReg = Math.floor(r() * 720) + 1;
  const daysAgoLogin = Math.floor(r() * 30);
  const product = pick(PLAYER_PRODUCTS);
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

export function makePlayerById(id: number): Player {
  const r = _seedRng(_strHash("pid:" + id));
  const pick = <T>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const fn = pick(PLAYER_FIRST_NAMES);
  const ln = pick(PLAYER_LAST_NAMES);
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
    state: pick(PLAYER_STATES),
    country: "India",
    tier: pick(PLAYER_TIERS),
    kyc: pick(PLAYER_KYC),
    lifetimeDep,
    lifetimeWager,
    lifetimeGgr: Math.round(lifetimeWager * (0.03 + r() * 0.07)),
    totalBonuses: Math.floor(r() * 28),
    sessions7: Math.floor(r() * 28),
    daysAgoReg: Math.floor(r() * 720) + 1,
    daysAgoLogin: Math.floor(r() * 30),
    product: pick(PLAYER_PRODUCTS),
  };
}

// Global pool (lazy, capped ~1500) for name/email search
let _GLOBAL_PLAYER_POOL: Player[] | null = null;
export function getGlobalPlayerPool(): Player[] {
  if (_GLOBAL_PLAYER_POOL) return _GLOBAL_PLAYER_POOL;
  const pool: Player[] = [];
  const seen = new Set<number>();
  for (const s of MANUAL_SEGMENTS) {
    const take = Math.min(80, s.count);
    for (let i = 0; i < take; i++) {
      const p = makePlayer(s.id, i);
      if (!seen.has(p.id)) {
        seen.add(p.id);
        pool.push(p);
        if (pool.length >= 1500) break;
      }
    }
    if (pool.length >= 1500) break;
  }
  _GLOBAL_PLAYER_POOL = pool;
  return pool;
}

// ── API ───────────────────────────────────────────────────────────────────────

const BONUS_API =
  (process.env.NEXT_PUBLIC_BONUS_API_URL || "http://localhost:8010") +
  "/api/v1/bonus";

console.log("BONUS_API", BONUS_API);
export const api = {
  async fetchKpiSnapshot(siteId: string | number) {
    const res = await fetch(`${BONUS_API}/bonus-summary?site_id=${siteId}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch bonus summary");
    return res.json();
  },
  async fetchHeads(siteId: string | number) {
    const res = await fetch(`${BONUS_API}/bonus-heads?site_id=${siteId}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch bonus heads");
    return res.json();
  },
  async fetchHead(id: number) {
    const res = await fetch(`${BONUS_API}/bonus-heads/${id}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Bonus head ${id} not found`);
    return res.json();
  },
  async fetchSubhead(id: number) {
    await delay();
    const s = MOCK_SUBHEADS[id];
    if (!s) throw new Error("Subhead not found: " + id);
    return s;
  },
  async fetchConfigure(id: number) {
    await delay();
    const c = MOCK_CONFIGURES[id];
    if (!c) throw new Error("Configure not found: " + id);
    return c;
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
    await delay();
    return getHistory(type, id);
  },
  async fetchBudget(scope: string, id: number) {
    await delay();
    return getBudget(scope, id);
  },
  async createHead(payload: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-heads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create bonus head");
    return res.json() as Promise<BonusHead>;
  },
  async updateHead(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`${BONUS_API}/bonus-heads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("Failed to update bonus head");
    return res.json() as Promise<BonusHead>;
  },
  async createSubhead(parentId: number, payload: Record<string, unknown>) {
    await delay(280);
    const id = Math.max(0, ...Object.keys(MOCK_SUBHEADS).map(Number)) + 1;
    const sub = { id, head_id: parentId, configures: [], ...payload };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MOCK_SUBHEADS as any)[id] = sub;
    if (MOCK_HEADS[parentId]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (MOCK_HEADS[parentId] as any).subheads = [
        ...(MOCK_HEADS[parentId].subheads || []),
        { id },
      ];
    }
    return sub as unknown as BonusSubhead;
  },
  async updateSubhead(id: number, patch: Record<string, unknown>) {
    await delay(280);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MOCK_SUBHEADS as any)[id] = { ...(MOCK_SUBHEADS as any)[id], ...patch };
    return MOCK_SUBHEADS[id];
  },
  async createConfigure(parentId: number, payload: Record<string, unknown>) {
    await delay(280);
    const id = Math.max(0, ...Object.keys(MOCK_CONFIGURES).map(Number)) + 1;
    const cfg = {
      id,
      subhead_id: parentId,
      promo_codes: [],
      triggers: [],
      eligibilities: [],
      ...payload,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MOCK_CONFIGURES as any)[id] = cfg;
    if (MOCK_SUBHEADS[parentId]) {
      MOCK_SUBHEADS[parentId].configures = [
        ...(MOCK_SUBHEADS[parentId].configures || []),
        id,
      ];
    }
    return cfg as unknown as BonusConfigure;
  },
  async updateConfigure(id: number, patch: Record<string, unknown>) {
    await delay(280);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MOCK_CONFIGURES as any)[id] = {
      ...(MOCK_CONFIGURES as any)[id],
      ...patch,
    };
    return MOCK_CONFIGURES[id];
  },
  async createPromoCode(configureId: number, payload: Record<string, unknown>) {
    await delay(280);
    const id = "PC" + Date.now();
    const code = { id, configure_id: configureId, ...payload };
    if (MOCK_CONFIGURES[configureId]) {
      MOCK_CONFIGURES[configureId].promo_codes = [
        ...(MOCK_CONFIGURES[configureId].promo_codes || []),
        code as never,
      ];
    }
    return code as unknown as PromoCode;
  },
  async createTrigger(configureId: number, payload: Record<string, unknown>) {
    await delay(280);
    const id = Date.now();
    const trigger = { id, configure_id: configureId, ...payload };
    if (MOCK_CONFIGURES[configureId]) {
      MOCK_CONFIGURES[configureId].triggers = [
        ...(MOCK_CONFIGURES[configureId].triggers || []),
        trigger as never,
      ];
    }
    return trigger as unknown as Trigger;
  },
  async createEligibility(
    configureId: number,
    payload: Record<string, unknown>,
  ) {
    await delay(280);
    const id = Date.now();
    const elig = { id, configure_id: configureId, ...payload };
    if (MOCK_CONFIGURES[configureId]) {
      MOCK_CONFIGURES[configureId].eligibilities = [
        ...(MOCK_CONFIGURES[configureId].eligibilities || []),
        elig as never,
      ];
    }
    return elig as unknown as EligibilityRule;
  },
  async updateBudget(_scope: string, _id: number, periods: BudgetPeriod[]) {
    await delay(280);
    return periods;
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
  async fetchSegmentPlayers(
    segmentId: string | number,
    { page = 1, search = "" }: { page?: number; search?: string } = {},
  ): Promise<PlayerPage> {
    await delay();
    const segment = MANUAL_SEGMENTS.find((s) => s.id === segmentId);
    if (!segment)
      return { players: [], page: 1, pageTotal: 1, total: 0, scopeNote: "" };

    const total = segment.count;
    const q = search.trim().toLowerCase();

    let slice: Player[],
      filteredTotal: number,
      pageTotal: number,
      scopeNote: string;

    if (q) {
      const cap = Math.min(total, PLAYERS_SEARCH_CAP);
      const searchPool: Player[] = [];
      for (let i = 0; i < cap; i++)
        searchPool.push(makePlayer(String(segmentId), i));

      const matches = searchPool.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          String(p.id).includes(q) ||
          p.email.toLowerCase().includes(q),
      );
      filteredTotal = matches.length;
      pageTotal = Math.max(1, Math.ceil(filteredTotal / PLAYERS_PAGE_SIZE));
      const safe = Math.min(page, pageTotal);
      slice = matches.slice(
        (safe - 1) * PLAYERS_PAGE_SIZE,
        safe * PLAYERS_PAGE_SIZE,
      );
      scopeNote =
        total > PLAYERS_SEARCH_CAP
          ? ` · searched first ${PLAYERS_SEARCH_CAP.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`
          : "";
    } else {
      filteredTotal = total;
      pageTotal = Math.max(1, Math.ceil(total / PLAYERS_PAGE_SIZE));
      const safe = Math.min(page, pageTotal);
      const startIdx = (safe - 1) * PLAYERS_PAGE_SIZE;
      const endIdx = Math.min(startIdx + PLAYERS_PAGE_SIZE, total);
      slice = [];
      for (let i = startIdx; i < endIdx; i++)
        slice.push(makePlayer(String(segmentId), i));
      scopeNote = "";
    }

    return { players: slice, page, pageTotal, total: filteredTotal, scopeNote };
  },
};
