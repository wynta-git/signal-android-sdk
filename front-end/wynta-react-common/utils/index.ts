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

export function formatINRCompact(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '∞';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!isFinite(n)) return '∞';
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
  if (n >= 100000)   return '₹' + (n / 100000).toFixed(2) + ' L';
  if (n >= 1000)     return '₹' + (n / 1000).toFixed(1) + 'k';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

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

/* ------------------------------------------------------------------ */
/* Segment condition formatter                                          */
/* ------------------------------------------------------------------ */

/** Convert snake_case / kebab-case to Title Case. */
function toLabel(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const FREQ_OP: Record<string, string> = {
  eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
};

type AnyFilter = Record<string, unknown>;

function formatFilter(f: AnyFilter): string {
  switch (f.type as string) {

    case 'event': {
      const name  = toLabel(String(f.event_name ?? ''));
      const freq  = (f.frequency ?? {}) as { op?: string; count?: number };
      const win   = (f.time_window ?? {}) as { last_days?: number };
      const op    = FREQ_OP[freq.op ?? ''] ?? freq.op ?? '';
      const count = freq.count ?? 1;
      let out = `${name} ${op} ${count}`.trim();
      if (win.last_days !== undefined) out += ` and within last ${win.last_days} days`;
      return out;
    }

    case 'trait': {
      const name  = toLabel(String(f.trait ?? ''));
      const op    = FREQ_OP[String(f.op ?? '')] ?? String(f.op ?? '');
      const raw   = f.value;
      const value = Array.isArray(raw)
        ? (raw as string[]).join(', ')
        : String(raw ?? '');
      return `${name} ${op} ${value}`.trim();
    }

    case 'did_not_do': {
      const name = toLabel(String(f.event_name ?? ''));
      const days = (f.time_window as { last_days?: number } | undefined)?.last_days;
      return days !== undefined
        ? `Did Not Do ${name} in last ${days} days`
        : `Did Not Do ${name}`;
    }

    case 'in_segment':
      return `In Segment: ${String(f.segment_id ?? '')}`;

    case 'derived':
    case 'derived_rule':
      return toLabel(String(f.rule_id ?? f.rule_name ?? ''));

    default:
      return '';
  }
}

/**
 * Convert a segment's `rule` DSL into a concise human-readable condition string.
 * Raw API data is never mutated — only transformed for display.
 *
 * @example
 *   formatConditions({ match: 'all', filters: [{ type: 'trait', trait: 'age', op: 'gte', value: 18 }] })
 *   // → "Age >= 18"
 */
export function formatConditions(rule: unknown): string {
  if (!rule || typeof rule !== 'object') return '';
  const r = rule as { match?: string; filters?: AnyFilter[] };
  if (!Array.isArray(r.filters) || r.filters.length === 0) return '';

  const sep    = r.match === 'any' ? ' OR ' : ' AND ';
  const parts  = r.filters.map(f => formatFilter(f)).filter(Boolean);
  return parts.join(sep);
}
