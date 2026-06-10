'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardSummary, selectDashboardStatus, selectDashboardWindowDays, selectDashboardDateRange } from '../../store/slices/dashboardSlice';


interface StatCardProps {
  label:    string;
  value:    string | number;
  change?:  number | null;
  loading?: boolean;
}

function StatCard({ label, value, change, loading }: StatCardProps) {
  const isPos = change != null && change > 0;
  const isNeg = change != null && change < 0;
  const changeColor = isPos ? 'var(--crm-positive, #10b981)' : isNeg ? 'var(--crm-negative, #ef4444)' : 'var(--crm-fg4)';

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 14, padding: '16px 16px 14px',
    }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', marginBottom: 8 }}>
        {label}
      </div>
      {loading ? (
        <div style={{ height: 28, width: '60%', background: 'var(--g100)', borderRadius: 4, marginBottom: 8 }} />
      ) : (
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--crm-fg1)', lineHeight: 1.1, marginBottom: 8 }}>
          {value}
        </div>
      )}
      {!loading && change != null ? (
        <span style={{ fontSize: 11, color: changeColor, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {isPos ? '↑' : isNeg ? '↓' : ''}{Math.abs(change).toFixed(1)}%
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDateRange(range: { start: string; end: string } | null, windowDays: number): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[Number(m) - 1]} ${String(Number(d)).padStart(2, '0')}, ${y}`;
  };
  if (range) return `${fmt(range.start)} – ${fmt(range.end)}`;
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (windowDays - 1));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `${fmt(iso(start))} – ${fmt(iso(today))}`;
}

export default function QuickStats() {
  const summary    = useAppSelector(selectDashboardSummary);
  const status     = useAppSelector(selectDashboardStatus);
  const windowDays = useAppSelector(selectDashboardWindowDays);
  const dateRange  = useAppSelector(selectDashboardDateRange);
  const loading    = status.summary === 'loading';
  const qs         = summary?.quick_stats;
  const optin      = summary?.channel_optin;
  const health     = summary?.player_health;

  const cards = [
    { label: 'Reachable Players', value: fmt(qs?.reachable_players?.value), change: qs?.reachable_players?.change_pct ?? null },
    { label: 'Active This Week',  value: fmt(qs?.active_this_week?.value),  change: qs?.active_this_week?.change_pct ?? null  },
    { label: 'Live Campaigns',    value: fmt(qs?.live_campaigns?.value),    change: null },
    { label: 'Active Segments',   value: fmt(qs?.active_segments?.value),   change: null },
    { label: 'Unsubscribe Rate',  value: qs?.opt_outs?.tracked ? `${((qs.opt_outs.value ?? 0) * 100).toFixed(2)}%` : '—', change: qs?.opt_outs?.change_pct ?? null },
    { label: 'Messages Sent',     value: fmt(qs?.messages_sent?.value),     change: qs?.messages_sent?.change_pct ?? null },
    { label: 'Delivery Rate',     value: qs?.delivery_rate?.value != null ? `${(qs.delivery_rate.value * 100).toFixed(1)}%` : '—', change: qs?.delivery_rate?.change_pct ?? null },
    { label: 'Opted-in (Push)',   value: fmt(optin?.push?.count),           change: optin?.push?.change_pct ?? null },
    { label: 'At-Risk Players',   value: fmt(health?.at_risk?.count),       change: null },
    { label: 'Churned Players',   value: fmt(health?.churned?.count),       change: null },
  ];

  return (
    <div>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="12" width="4" height="9" rx="1" />
            <rect x="10" y="7" width="4" height="14" rx="1" />
            <rect x="17" y="3" width="4" height="18" rx="1" />
          </svg>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>Quick Stats</h2>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
            <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
            <text x="7" y="11" fontSize="8" fill="#9ca3af" textAnchor="middle">i</text>
          </svg>
        </div>
        <span style={{ fontSize: 12, color: 'var(--crm-fg4)' }}>
          {fmtDateRange(dateRange, windowDays)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {cards.map(c => (
          <StatCard key={c.label} label={c.label} value={loading ? '' : c.value} change={c.change} loading={loading} />
        ))}
      </div>
    </div>
  );
}
