import type { TrackedValue } from '../../types';

/**
 * Renders "—" for metrics with no real data source yet (see TrackedValue).
 *
 * `tv.value` may arrive as a JSON string, not a number — Pydantic v2 serializes
 * Decimal fields (avg_payout, avg_cost_per_redemption, budget_used, ...) to
 * strings by default to avoid float precision loss, even though the field is
 * typed `number | null` in TypeScript.
 */
export function trackedCell(tv: TrackedValue, format: (n: number) => string): string {
  if (!tv.tracked || tv.value === null) return '—';
  const n = typeof tv.value === 'string' ? parseFloat(tv.value) : tv.value;
  return isFinite(n) ? format(n) : '—';
}
