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
