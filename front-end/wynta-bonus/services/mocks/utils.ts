import { MOCK_HEADS } from './heads';
import { MOCK_SUBHEADS } from './subheads';
import { MOCK_CONFIGURES } from './configures';
import { LIFECYCLE_STATES, CONFIGURE_USAGE, CODE_USAGE } from './lifecycle';
import type { UsageData } from './lifecycle';
import { CONFIGURE_BUDGETS, CODE_BUDGETS } from './budgets';
import { HEAD_HISTORY, SUBHEAD_HISTORY, CONFIGURE_HISTORY } from './history';
import type { HistoryEntry } from './history';
import type { BudgetPeriod } from '../../types';

const _now = new Date('2026-05-16T12:00:00Z');

export function formatINR(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '∞';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!isFinite(n)) return '∞';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatINRCompact(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '∞';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!isFinite(n)) return '∞';
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
  if (n >= 100000)   return '₹' + (n / 100000).toFixed(2) + ' L';
  if (n >= 1000)     return '₹' + (n / 1000).toFixed(1) + 'k';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatDate(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function formatRelative(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const ms = d.getTime() - Date.now();
  const minutes = Math.round(ms / 60000);
  if (minutes === 0) return 'just now';
  if (Math.abs(minutes) < 60) return minutes > 0 ? `in ${minutes}m` : `${-minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `in ${hours}h` : `${-hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return days > 0 ? `in ${days}d` : `${-days}d ago`;
  const months = Math.round(days / 30);
  return months > 0 ? `in ${months}mo` : `${-months}mo ago`;
}

// avatar gradient from username hash
export function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 35 + (h >> 8) % 20) % 360;
  return `linear-gradient(135deg, hsl(${a}, 70%, 52%), hsl(${b}, 75%, 60%))`;
}

export function initial(name: string | undefined | null): string {
  return (name || '?').trim()[0]?.toUpperCase() || '?';
}

// ============================================================
// Aggregation helpers
// ============================================================
function _u(
  p: [number, string],
  r: [number, string],
  c: [number, string],
  e: [number, string],
  f: [number, string],
): UsageData {
  return {
    states: {
      PENDING:   { count: p[0], amount: p[1] },
      RELEASED:  { count: r[0], amount: r[1] },
      CONSUMED:  { count: c[0], amount: c[1] },
      EXPIRED:   { count: e[0], amount: e[1] },
      FORFEITED: { count: f[0], amount: f[1] },
    },
  };
}

export function _emptyUsage(): UsageData {
  return _u([0,'0.00'],[0,'0.00'],[0,'0.00'],[0,'0.00'],[0,'0.00']);
}

export function _sumUsage(into: UsageData, from: UsageData | undefined): UsageData {
  if (!from) return into;
  for (const s of LIFECYCLE_STATES) {
    into.states[s].count  += from.states[s].count;
    into.states[s].amount = (parseFloat(String(into.states[s].amount)) + parseFloat(String(from.states[s].amount))).toFixed(2);
  }
  return into;
}

export function getUsage(type: string, id: number): UsageData {
  if (type === 'configure') return CONFIGURE_USAGE[id] || _emptyUsage();
  if (type === 'code')      return CODE_USAGE[id]      || _emptyUsage();
  if (type === 'subhead') {
    const sub = MOCK_SUBHEADS[id];
    if (!sub) return _emptyUsage();
    const agg = _emptyUsage();
    for (const cfgId of sub.configures) {
      if (typeof cfgId === 'number') _sumUsage(agg, CONFIGURE_USAGE[cfgId]);
    }
    return agg;
  }
  if (type === 'head') {
    const head = MOCK_HEADS[id];
    if (!head) return _emptyUsage();
    const agg = _emptyUsage();
    for (const sh of head.subheads) {
      const sub = MOCK_SUBHEADS[sh.id];
      if (!sub) continue;
      for (const cfgId of sub.configures) {
        if (typeof cfgId === 'number') _sumUsage(agg, CONFIGURE_USAGE[cfgId]);
      }
    }
    return agg;
  }
  return _emptyUsage();
}

export function usageGranted(usage: UsageData | undefined | null): number {
  if (!usage) return 0;
  let total = 0;
  for (const s of LIFECYCLE_STATES) total += parseFloat(String(usage.states[s].amount)) || 0;
  return total;
}

export function getBudget(type: string, id: number): BudgetPeriod[] {
  if (type === 'head')      return MOCK_HEADS[id]?.budget || [];
  if (type === 'subhead')   return MOCK_SUBHEADS[id]?.budget || [];
  if (type === 'configure') return CONFIGURE_BUDGETS[id] || _inheritBudgetForConfigure(id) || [];
  if (type === 'code')      return CODE_BUDGETS[id]      || _inheritBudgetForCode(id)      || [];
  return [];
}

export function _inheritBudgetForConfigure(id: number): BudgetPeriod[] | null {
  const cfg = MOCK_CONFIGURES[id];
  if (!cfg) return null;
  const sub = MOCK_SUBHEADS[cfg.subhead_id];
  return sub ? (sub.budget ?? null) : null;
}

export function _inheritBudgetForCode(id: number): BudgetPeriod[] | null {
  for (const cfg of Object.values(MOCK_CONFIGURES)) {
    if (cfg.codes && cfg.codes.find(c => c.id === id)) {
      return CONFIGURE_BUDGETS[cfg.id] || _inheritBudgetForConfigure(cfg.id);
    }
  }
  return null;
}

export function isBudgetInherited(type: string, id: number): boolean {
  if (type === 'configure') return !CONFIGURE_BUDGETS[id];
  if (type === 'code')      return !CODE_BUDGETS[id];
  return false;
}

export function getHistory(type: string | number, id?: number): HistoryEntry[] {
  // Backwards-compat: getHistory(id) → getHistory('configure', id)
  if (id === undefined && typeof type === 'number') {
    id = type; type = 'configure';
  }
  if (type === 'head')      return HEAD_HISTORY[id as number]      || [];
  if (type === 'subhead')   return SUBHEAD_HISTORY[id as number]   || [];
  if (type === 'configure') return CONFIGURE_HISTORY[id as number] || [];
  return [];
}
