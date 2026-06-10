'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardSummary, selectDashboardStatus } from '../../store/slices/dashboardSlice';

interface StatCardProps {
  label:    string;
  value:    string | number;
  change?:  number | null;
  loading?: boolean;
}

function StatCard({ label, value, change, loading }: StatCardProps) {
  const isPos = change != null && change > 0;

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 14, padding: '16px 16px 14px',
    }}>
      <div style={{ fontSize: 12, color: '#6B7280', clear: 'both', marginBottom: 8 }}>
        {label}
      </div>
      {loading ? (
        <div style={{ height: 28, width: '60%', background: 'var(--g100)', borderRadius: 4, marginBottom: 8 }} />
      ) : (
        <div style={{ fontSize: 20, color: '#262626', marginBottom: 4, display: 'block' }}>
          {value}
        </div>
      )}
      {!loading && (
        change != null ? (
          <div style={{ fontSize: 14, fontWeight: 500, marginTop: 0, color: isPos ? '#009600' : '#d41616', display: 'block' }}>
            {isPos ? '↑' : '↓'}{Math.abs(change).toFixed(1)}%
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#6B7280', display: 'block' }}>No Data</div>
        )
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

export default function QuickStats() {
  const summary = useAppSelector(selectDashboardSummary);
  const status  = useAppSelector(selectDashboardStatus);
  const loading = status.summary === 'loading';
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
      {/* Section heading */}

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {cards.map(c => (
          <StatCard
            key={c.label}
            label={c.label}
            value={loading ? '' : c.value}
            change={c.change}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}
