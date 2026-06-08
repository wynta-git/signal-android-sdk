'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardSummary, selectDashboardStatus } from '../../store/slices/dashboardSlice';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number | null;
  loading?: boolean;
}

function StatCard({ label, value, change, loading }: StatCardProps) {
  const isPos = change != null && change > 0;
  const isNeg = change != null && change < 0;

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, padding: '18px 20px 16px', minHeight: 100,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--crm-fg4)', marginBottom: 8 }}>
        {label}
      </div>
      {loading ? (
        <div style={{ height: 32, width: '60%', background: 'var(--g100)', borderRadius: 4 }} />
      ) : (
        <div style={{ fontSize: 32, fontWeight: 400, color: 'var(--crm-fg1)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
          {value}
        </div>
      )}
      {change != null && !loading && (
        <div style={{
          fontSize: 12, color: isPos ? 'var(--crm-positive)' : isNeg ? 'var(--crm-negative)' : 'var(--crm-fg4)',
          marginTop: 4,
        }}>
          {isPos ? '▲' : isNeg ? '▼' : ''} {Math.abs(change).toFixed(1)}% vs prev period
        </div>
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
  const qs      = summary?.quick_stats;
  const optin   = summary?.channel_optin;
  const health  = summary?.player_health;

  const cards = [
    { label: 'Reachable Players', value: fmt(qs?.reachable_players?.value),                                                                       change: qs?.reachable_players?.change_pct ?? null },
    { label: 'Active This Week',  value: fmt(qs?.active_this_week?.value),                                                                        change: qs?.active_this_week?.change_pct ?? null },
    { label: 'Live Campaigns',    value: fmt(qs?.live_campaigns?.value),                                                                          change: null },
    { label: 'Active Segments',   value: fmt(qs?.active_segments?.value),                                                                         change: null },
    { label: 'Unsubscribe Rate',  value: '—',                                                                                                     change: null },
    { label: 'Messages Sent',     value: fmt(qs?.messages_sent?.value),                                                                           change: qs?.messages_sent?.change_pct ?? null },
    { label: 'Delivery Rate',     value: qs?.delivery_rate?.value != null ? `${(qs.delivery_rate.value * 100).toFixed(1)}%` : '—',                change: null },
    { label: 'Opted-in (Push)',   value: fmt(optin?.push?.count),                                                                                 change: null },
    { label: 'At-Risk Players',   value: fmt(health?.at_risk?.count),                                                                             change: null },
    { label: 'Churned Players',   value: fmt(health?.churned?.count),                                                                             change: null },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
      {cards.map(c => (
        <StatCard key={c.label} label={c.label} value={loading ? '' : c.value} change={c.change} loading={loading} />
      ))}
    </div>
  );
}
