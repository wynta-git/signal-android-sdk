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
