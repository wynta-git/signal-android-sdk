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

  const cards = [
    { label: 'Total Players',      value: fmt(qs?.total_players),             change: null },
    { label: 'Active Players',     value: fmt(qs?.active_players_7d?.value),  change: qs?.active_players_7d?.pct_change },
    { label: 'New Players',        value: fmt(qs?.new_players_7d?.value),     change: qs?.new_players_7d?.pct_change },
    { label: 'Total Revenue',      value: qs?.total_revenue?.value != null ? `$${fmt(qs.total_revenue.value)}` : '—', change: qs?.total_revenue?.pct_change },
    { label: 'Campaigns Sent',     value: fmt(qs?.campaigns_sent),            change: null },
    { label: 'Msgs Delivered',     value: fmt(qs?.messages_delivered),        change: null },
    { label: 'Delivery Rate',      value: qs?.delivery_rate?.value != null ? `${qs.delivery_rate.value.toFixed(1)}%` : '—', change: qs?.delivery_rate?.pct_change },
    { label: 'Opted-in (Push)',    value: fmt(qs?.opted_in_push),             change: null },
    { label: 'At-Risk Players',    value: fmt(qs?.at_risk_count),             change: null },
    { label: 'Churned Players',    value: fmt(qs?.churned_count),             change: null },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
      {cards.map(c => (
        <StatCard key={c.label} label={c.label} value={loading ? '' : c.value} change={c.change} loading={loading} />
      ))}
    </div>
  );
}
