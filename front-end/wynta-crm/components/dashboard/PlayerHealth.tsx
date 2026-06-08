'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardSummary, selectDashboardStatus } from '../../store/slices/dashboardSlice';

interface HealthBucket {
  label: string;
  key: 'new' | 'healthy' | 'at_risk' | 'churned';
  color: string;
  bg: string;
}

const BUCKETS: HealthBucket[] = [
  { label: 'New',      key: 'new',     color: '#0091e0', bg: '#e8f5ff' },
  { label: 'Healthy',  key: 'healthy', color: '#10b981', bg: '#e6f6ec' },
  { label: 'At Risk',  key: 'at_risk', color: '#f59e0b', bg: '#fffbeb' },
  { label: 'Churned',  key: 'churned', color: '#ef4444', bg: '#fce8e8' },
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
  const total   = health?.total_users ?? 1;

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, padding: '16px 20px',
    }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-fg1)' }}>Player Health</h2>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 52, background: 'var(--g100)', borderRadius: 8 }} />
          ))}
        </div>
      )}

      {!loading && !health && (
        <p style={{ fontSize: 12, color: 'var(--crm-fg4)', textAlign: 'center', padding: '20px 0' }}>
          No health data available
        </p>
      )}

      {!loading && health && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {BUCKETS.map(b => {
            const count = health[b.key].count;
            const pct   = (health[b.key].pct ?? 0) * 100;
            return (
              <div key={b.key} style={{
                background: b.bg, borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: b.color }}>{b.label}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-fg1)' }}>{fmt(count)}</span>
                    <span style={{ fontSize: 11, color: 'var(--crm-fg4)' }}>{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ height: 5, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${Math.min(pct, 100)}%`,
                    background: b.color, borderRadius: 4, transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
