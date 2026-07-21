'use client';
import CountUp from 'wynta-react-common/components/CountUp';
import { formatINRCompact } from '../../services/mocks/utils';
import type { BonusDashboardSummary } from '../../types';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  subColor?: 'up' | 'down' | 'neutral';
  badge?: string;
  loading?: boolean;
}

function StatCard({ label, value, sub, subColor = 'neutral', badge, loading }: StatCardProps) {
  return (
    <div className="dq-stat-card">
      <div className="dq-stat-label">
        {label}
        {badge && <span className={'dq-badge dq-badge-' + subColor}>{badge}</span>}
      </div>
      {loading ? (
        <div className="dq-skeleton-line" style={{ width: '60%', height: 22, marginBottom: 6 }} />
      ) : (
        <div className="dq-stat-value">{value}</div>
      )}
      {!loading && sub && <div className={'dq-stat-sub dq-stat-sub-' + subColor}>{sub}</div>}
    </div>
  );
}

function deltaSub(pct: number | null | undefined, suffix = 'vs prior period'): { text: React.ReactNode; color: 'up' | 'down' | 'neutral' } {
  if (pct === null || pct === undefined) return { text: `— ${suffix}`, color: 'neutral' };
  const color = pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral';
  const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '—';
  return { text: `${arrow} ${Math.abs(pct).toFixed(1)}% ${suffix}`, color };
}

interface QuickStatsGridProps {
  summary: BonusDashboardSummary | null;
  loading: boolean;
}

export default function QuickStatsGrid({ summary, loading }: QuickStatsGridProps) {
  const s = summary;
  const redemptionsDelta = deltaSub(s?.redemptions_change_pct, 'vs last week');
  const playersDelta = deltaSub(s?.active_players_change_pct, '');
  const expiryHigh = (s?.expiry_pct ?? 0) >= 10;

  return (
    <div className="dq-grid">
      <StatCard
        label="Active Promo Codes"
        value={loading ? '' : <CountUp value={s?.active_promo_codes ?? 0} />}
        sub={loading ? undefined : `↑ +${s?.promo_codes_created_this_period ?? 0} this week`}
        subColor="up"
        loading={loading}
      />
      <StatCard
        label="Active Bonus Configs"
        value={loading ? '' : <CountUp value={s?.active_configures ?? 0} />}
        sub={loading ? undefined : `— ${s?.active_configures_paused ?? 0} paused`}
        loading={loading}
      />
      <StatCard
        label="Redemptions (7d)"
        value={loading ? '' : <CountUp value={s?.redemptions ?? 0} />}
        sub={loading ? undefined : redemptionsDelta.text}
        subColor={redemptionsDelta.color}
        loading={loading}
      />
      <StatCard
        label="Avg Payout"
        value={loading ? '' : formatINRCompact(s?.avg_payout ?? 0)}
        sub={loading ? undefined : '— per redemption'}
        loading={loading}
      />
      <StatCard
        label="Active Players (30d)"
        value={loading ? '' : <CountUp value={s?.active_players ?? 0} />}
        sub={loading ? undefined : playersDelta.text}
        subColor={playersDelta.color}
        loading={loading}
      />
      <StatCard
        label="Monthly Credited"
        value={loading ? '' : formatINRCompact(s?.monthly_granted ?? 0)}
        sub={loading ? undefined : `— ${(s?.monthly_pct ?? 0).toFixed(0)}% of budget`}
        loading={loading}
      />
      <StatCard
        label="Wagering Completion"
        value={loading ? '' : `${(s?.released_pct ?? 0).toFixed(0)}%`}
        sub={loading ? undefined : '↑ of credited amount'}
        subColor="up"
        loading={loading}
      />
      <StatCard
        label="Consumption Rate"
        value={loading ? '' : `${(s?.consumed_pct ?? 0).toFixed(0)}%`}
        sub={loading ? undefined : '↑ of released'}
        subColor="up"
        loading={loading}
      />
      <StatCard
        label="Expiry Rate"
        value={loading ? '' : `${(s?.expiry_pct ?? 0).toFixed(0)}%`}
        sub={loading ? undefined : '↓ monitor closely'}
        subColor={expiryHigh ? 'down' : 'neutral'}
        badge={expiryHigh ? 'High' : undefined}
        loading={loading}
      />
      <StatCard
        label="Programs Budget Used"
        value={loading ? '' : `${(s?.monthly_pct ?? 0).toFixed(0)}%`}
        sub={loading ? undefined : `— ${formatINRCompact(s?.monthly_granted ?? 0)} used`}
        loading={loading}
      />
    </div>
  );
}
