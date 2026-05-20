const _now = new Date('2026-05-16T12:00:00Z');

export function iso(daysOffset: number, base: Date = _now): string {
  const d = new Date(base);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}
