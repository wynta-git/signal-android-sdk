export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC'
}

export function formatDecimal(val: string | null | undefined): string {
  if (val === null || val === undefined) return '—'
  const n = parseFloat(val)
  return isNaN(n) ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Convert a JS Date to ISO 8601 UTC string for the API. */
export function toApiDatetime(d: Date | null | undefined): string | null {
  if (!d) return null
  return d.toISOString()
}

/** Parse an API datetime string into a JS Date (treating it as UTC). */
export function fromApiDatetime(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s.endsWith('Z') ? s : s + 'Z')
  return isNaN(d.getTime()) ? null : d
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
