'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardSummary, selectDashboardStatus } from '../../store/slices/dashboardSlice';

const BUCKETS = [
  { label: 'New',     key: 'new'     as const, color: '#0091e0', bg: '#e8f5ff' },
  { label: 'Healthy', key: 'healthy' as const, color: '#10b981', bg: '#e6f6ec' },
  { label: 'At Risk', key: 'at_risk' as const, color: '#f59e0b', bg: '#fffbeb' },
  { label: 'Churned', key: 'churned' as const, color: '#ef4444', bg: '#fce8e8' },
];

// Demo-only metrics — not yet available from backend
const PROGRESS_METRICS = [
  { label: 'At-Risk Contacted',   pct: 68, color: '#0091e0' },
  { label: 'Re-engagement Rate',  pct: 42, color: '#10b981' },
  { label: 'Win-back Success',    pct: 28, color: '#f59e0b' },
];

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function PlayerHealth() {
  const summary = useAppSelector(selectDashboardSummary);
  const status  = useAppSelector(selectDashboardStatus);
  const loading = status.summary === 'loading';
  const health  = summary?.player_health;

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ background: 'var(--crm-bg)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--crm-border)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>Player Health</h2>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
          <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
          <text x="7" y="11" fontSize="8" fill="#9ca3af" textAnchor="middle">i</text>
        </svg>
      </div>

      {/* Bucket cards */}
      <div style={{ padding: '16px 20px 20px' }}>
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 100, background: 'var(--g100)', borderRadius: 12 }} />
            ))}
          </div>
        )}

        {!loading && !health && (
          <p style={{ fontSize: 12, color: 'var(--crm-fg4)', textAlign: 'center', padding: '20px 0' }}>
            No health data available
          </p>
        )}

        {!loading && health && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              {BUCKETS.map(b => {
                const count = health[b.key].count;
                const pct   = ((health[b.key].pct ?? 0) * 100).toFixed(0);
                return (
                  <div key={b.key} style={{
                    background: b.bg, borderRadius: 12, padding: '16px 12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: b.color }}>{b.label}</span>
                    <span style={{ fontSize: 28, fontWeight: 800, color: b.color, lineHeight: 1 }}>{fmt(count)}</span>
                    <span style={{ fontSize: 12, color: b.color, opacity: 0.75 }}>{pct}%</span>
                  </div>
                );
              })}
            </div>

            {/* Progress metrics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PROGRESS_METRICS.map(m => (
                <div key={m.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--crm-fg2)' }}>{m.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-fg1)' }}>{m.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${m.pct}%`,
                      background: m.color, borderRadius: 4,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
