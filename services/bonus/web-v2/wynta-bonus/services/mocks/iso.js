export const now = '2026-05-16T12:00:00Z';

const _now = new Date(now);
export function iso(daysOffset, base = _now) {
  const d = new Date(base);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}
