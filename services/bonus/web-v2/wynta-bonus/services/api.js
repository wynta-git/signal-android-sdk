import { MOCK_HEADS } from './mocks/heads.js';
import { MOCK_SUBHEADS } from './mocks/subheads.js';
import { MOCK_CONFIGURES } from './mocks/configures.js';
import { getUsage, getBudget, getHistory } from './mocks/utils.js';
import {
  MANUAL_SEGMENTS,
  PLAYER_FIRST_NAMES, PLAYER_LAST_NAMES, PLAYER_STATES,
  PLAYER_TIERS, PLAYER_KYC, PLAYER_PRODUCTS,
  PLAYERS_PAGE_SIZE, PLAYERS_SEARCH_CAP,
} from './mocks/constants.js';

const delay = (ms = 180) => new Promise(r => setTimeout(r, ms));

// ── Deterministic player generation ──────────────────────────────────────────

function _strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function _seedRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function makePlayer(segmentId, index) {
  const r = _seedRng(_strHash(segmentId + ':' + index));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
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
  const phone = '+91 ' + (60000 + Math.floor(r() * 39999)) + ' ' + (10000 + Math.floor(r() * 89999));
  return { id, name, email, phone, state, country: 'India', tier, kyc, lifetimeDep, lifetimeWager, lifetimeGgr, totalBonuses, sessions7, daysAgoReg, daysAgoLogin, product };
}

export function makePlayerById(id) {
  const r = _seedRng(_strHash('pid:' + id));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
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
    phone: '+91 ' + (60000 + Math.floor(r() * 39999)) + ' ' + (10000 + Math.floor(r() * 89999)),
    state: pick(PLAYER_STATES),
    country: 'India',
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
let _GLOBAL_PLAYER_POOL = null;
export function getGlobalPlayerPool() {
  if (_GLOBAL_PLAYER_POOL) return _GLOBAL_PLAYER_POOL;
  const pool = [];
  const seen = new Set();
  for (const s of MANUAL_SEGMENTS) {
    const take = Math.min(80, s.count);
    for (let i = 0; i < take; i++) {
      const p = makePlayer(s.id, i);
      if (!seen.has(p.id)) { seen.add(p.id); pool.push(p); if (pool.length >= 1500) break; }
    }
    if (pool.length >= 1500) break;
  }
  _GLOBAL_PLAYER_POOL = pool;
  return pool;
}

// ── API ───────────────────────────────────────────────────────────────────────

const BONUS_API = process.env.NEXT_PUBLIC_BONUS_API_URL || 'http://localhost:8000';

export const api = {
  async fetchKpiSnapshot(siteId) {
    const res = await fetch(`${BONUS_API}/bonus-summary?site_id=${siteId}`);
    if (!res.ok) throw new Error('Failed to fetch bonus summary');
    return res.json();
  },
  async fetchBrands(userId = 1) {
    const res = await fetch(`${BONUS_API}/brands?user_id=${userId}`);
    if (!res.ok) throw new Error('Failed to fetch brands');
    return res.json();
  },
  async fetchHeads(siteId) {
    const res = await fetch(`${BONUS_API}/bonus-heads?site_id=${siteId}`);
    if (!res.ok) throw new Error('Failed to fetch bonus heads');
    return res.json();
  },
  async fetchHead(id) {
    const res = await fetch(`${BONUS_API}/bonus-heads/${id}`);
    if (!res.ok) throw new Error(`Bonus head ${id} not found`);
    return res.json();
  },
  async fetchSubhead(id) {
    await delay();
    const s = MOCK_SUBHEADS[id];
    if (!s) throw new Error('Subhead not found: ' + id);
    return s;
  },
  async fetchConfigure(id) {
    await delay();
    const c = MOCK_CONFIGURES[id];
    if (!c) throw new Error('Configure not found: ' + id);
    return c;
  },
  async fetchConfigureUsage(id) {
    await delay();
    return getUsage('configure', id);
  },
  async fetchCodeUsage(codeId) {
    await delay();
    return getUsage('code', codeId);
  },
  async fetchHistory(type, id) {
    await delay();
    return getHistory(type, id);
  },
  async fetchBudget(scope, id) {
    await delay();
    return getBudget(scope, id);
  },
  async createHead(payload) {
    await delay(280);
    const id = Math.max(0, ...Object.keys(MOCK_HEADS).map(Number)) + 1;
    const head = { id, ...payload, subheads: [], budget: [] };
    MOCK_HEADS[id] = head;
    return head;
  },
  async updateHead(id, patch) {
    await delay(280);
    MOCK_HEADS[id] = { ...MOCK_HEADS[id], ...patch };
    return MOCK_HEADS[id];
  },
  async createSubhead(parentId, payload) {
    await delay(280);
    const id = Math.max(0, ...Object.keys(MOCK_SUBHEADS).map(Number)) + 1;
    const sub = { id, head_id: parentId, configures: [], ...payload };
    MOCK_SUBHEADS[id] = sub;
    if (MOCK_HEADS[parentId]) {
      MOCK_HEADS[parentId].subheads = [...(MOCK_HEADS[parentId].subheads || []), { id }];
    }
    return sub;
  },
  async updateSubhead(id, patch) {
    await delay(280);
    MOCK_SUBHEADS[id] = { ...MOCK_SUBHEADS[id], ...patch };
    return MOCK_SUBHEADS[id];
  },
  async createConfigure(parentId, payload) {
    await delay(280);
    const id = Math.max(0, ...Object.keys(MOCK_CONFIGURES).map(Number)) + 1;
    const cfg = { id, subhead_id: parentId, promo_codes: [], triggers: [], eligibilities: [], ...payload };
    MOCK_CONFIGURES[id] = cfg;
    if (MOCK_SUBHEADS[parentId]) {
      MOCK_SUBHEADS[parentId].configures = [...(MOCK_SUBHEADS[parentId].configures || []), id];
    }
    return cfg;
  },
  async updateConfigure(id, patch) {
    await delay(280);
    MOCK_CONFIGURES[id] = { ...MOCK_CONFIGURES[id], ...patch };
    return MOCK_CONFIGURES[id];
  },
  async createPromoCode(configureId, payload) {
    await delay(280);
    const id = 'PC' + Date.now();
    const code = { id, configure_id: configureId, ...payload };
    if (MOCK_CONFIGURES[configureId]) {
      MOCK_CONFIGURES[configureId].promo_codes = [...(MOCK_CONFIGURES[configureId].promo_codes || []), code];
    }
    return code;
  },
  async createTrigger(configureId, payload) {
    await delay(280);
    const id = Date.now();
    const trigger = { id, configure_id: configureId, ...payload };
    if (MOCK_CONFIGURES[configureId]) {
      MOCK_CONFIGURES[configureId].triggers = [...(MOCK_CONFIGURES[configureId].triggers || []), trigger];
    }
    return trigger;
  },
  async createEligibility(configureId, payload) {
    await delay(280);
    const id = Date.now();
    const elig = { id, configure_id: configureId, ...payload };
    if (MOCK_CONFIGURES[configureId]) {
      MOCK_CONFIGURES[configureId].eligibilities = [...(MOCK_CONFIGURES[configureId].eligibilities || []), elig];
    }
    return elig;
  },
  async updateBudget(scope, id, periods) {
    await delay(280);
    return periods;
  },
  async createManualBonus(subheadId, payload) {
    await delay(280);
    return { id: Date.now(), subhead_id: subheadId, ...payload };
  },
  async issueCodeBonus(payload) {
    await delay(280);
    return { id: Date.now(), ...payload };
  },
  async fetchSegments() {
    await delay();
    return MANUAL_SEGMENTS;
  },
  async createSegment(payload) {
    await delay(280);
    const id = Date.now();
    return { id, ...payload };
  },
  async fetchSegmentPlayers(segmentId, { page = 1, search = '' } = {}) {
    await delay();
    const segment = MANUAL_SEGMENTS.find(s => s.id === segmentId);
    if (!segment) return { players: [], page: 1, pageTotal: 1, total: 0, scopeNote: '' };

    const total = segment.count;
    const q = search.trim().toLowerCase();

    let slice, filteredTotal, pageTotal, scopeNote;

    if (q) {
      const cap = Math.min(total, PLAYERS_SEARCH_CAP);
      const searchPool = [];
      for (let i = 0; i < cap; i++) searchPool.push(makePlayer(segmentId, i));

      const matches = searchPool.filter(p =>
        p.name.toLowerCase().includes(q) ||
        String(p.id).includes(q) ||
        p.email.toLowerCase().includes(q)
      );
      filteredTotal = matches.length;
      pageTotal = Math.max(1, Math.ceil(filteredTotal / PLAYERS_PAGE_SIZE));
      const safe = Math.min(page, pageTotal);
      slice = matches.slice((safe - 1) * PLAYERS_PAGE_SIZE, safe * PLAYERS_PAGE_SIZE);
      scopeNote = total > PLAYERS_SEARCH_CAP
        ? ` · searched first ${PLAYERS_SEARCH_CAP.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`
        : '';
    } else {
      filteredTotal = total;
      pageTotal = Math.max(1, Math.ceil(total / PLAYERS_PAGE_SIZE));
      const safe = Math.min(page, pageTotal);
      const startIdx = (safe - 1) * PLAYERS_PAGE_SIZE;
      const endIdx = Math.min(startIdx + PLAYERS_PAGE_SIZE, total);
      slice = [];
      for (let i = startIdx; i < endIdx; i++) slice.push(makePlayer(segmentId, i));
      scopeNote = '';
    }

    return { players: slice, page, pageTotal, total: filteredTotal, scopeNote };
  },
};
