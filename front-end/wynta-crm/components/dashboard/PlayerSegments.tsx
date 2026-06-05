'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardSegments, selectDashboardStatus } from '../../store/slices/dashboardSlice';

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const BAR_COLORS = [
  '#0091e0', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1',
];

export default function PlayerSegments() {
  const segments = useAppSelector(selectDashboardSegments);
  const status   = useAppSelector(selectDashboardStatus);
  const loading  = status.segments === 'loading';
  const items    = segments?.items ?? [];

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-fg1)' }}>Player Segments</h2>
        {segments && (
          <span style={{ fontSize: 11, color: 'var(--crm-fg4)' }}>
            {segments.total} total
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 32, background: 'var(--g100)', borderRadius: 6 }} />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--crm-fg4)', textAlign: 'center', padding: '20px 0' }}>
          No segments available
        </p>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((seg, i) => (
            <div key={seg.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{
                  fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%',
                }}>
                  {seg.name}
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-fg1)' }}>
                    {fmt(seg.members_count)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--crm-fg4)', minWidth: 36, textAlign: 'right' }}>
                    {seg.pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div style={{ height: 6, background: 'var(--g100)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min(seg.pct, 100)}%`,
                  background: BAR_COLORS[i % BAR_COLORS.length],
                  borderRadius: 4, transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
