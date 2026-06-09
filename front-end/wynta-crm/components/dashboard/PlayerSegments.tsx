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
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div style={{
        background: 'var(--crm-bg)', padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--crm-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>Player Segments</h2>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
            <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
            <text x="7" y="11" fontSize="8" fill="#9ca3af" textAnchor="middle">i</text>
          </svg>
        </div>
        {/* <a href="/segments" style={{ fontSize: 12, color: 'var(--crm-blue)', textDecoration: 'none', fontWeight: 500 }}>
          Manage →
        </a> */}
      </div>

      <div style={{ padding: '16px 20px' }}>
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
          {items.slice(0, 8).map((seg, i) => (
            <div key={seg.id ?? i}>
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
    </div>
  );
}
