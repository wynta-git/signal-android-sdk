'use client';
import Badge from 'wynta-react-common/components/Badge';
import { formatINRCompact } from '../../services/mocks/utils';
import type { BonusDashboardTopBonusesResponse } from '../../types';

interface Props {
  data: BonusDashboardTopBonusesResponse | null;
  loading: boolean;
}

function Sparkline({ points }: { points: number[] }) {
  if (!points || points.length < 2) return <span className="dq-sparkline-empty">—</span>;
  const w = 60, h = 22;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const pts = points.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="dq-sparkline">
      <polyline points={pts} fill="none" stroke="var(--blue)" strokeWidth={1.6} />
    </svg>
  );
}

export default function TopPerformingBonusesTable({ data, loading }: Props) {
  return (
    <div className="dq-card">
      <div className="dq-card-header">
        Top Performing Bonuses
        <span className="dq-lifecycle-hint">Last 7 days · by redemptions</span>
      </div>
      <table className="dq-table">
        <thead>
          <tr>
            <th>Bonus</th>
            <th>Type</th>
            <th>7D Trend</th>
            <th>Players</th>
            <th>Avg Payout</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={6}><div className="dq-skeleton-line" style={{ height: 16 }} /></td>
              </tr>
            ))}
          {!loading && (!data || data.bonuses.length === 0) && (
            <tr><td colSpan={6} className="dq-empty-cell">No bonus activity in this period</td></tr>
          )}
          {!loading && data?.bonuses.map((b, i) => (
            <tr key={b.configure_id}>
              <td>
                <div className="dq-table-name-row">
                  <span className="dq-table-rank">{i + 1}</span>
                  <div>
                    <div className="dq-table-name">{b.name}</div>
                    {b.subtitle && <div className="dq-table-subtitle">{b.subtitle}</div>}
                  </div>
                </div>
              </td>
              <td>{b.type}</td>
              <td>
                <div className="dq-table-trend">
                  <Sparkline points={b.trend.map((t) => t.count)} />
                  <span className="dq-table-trend-n">{b.redemptions}</span>
                </div>
              </td>
              <td>{b.players}</td>
              <td>{formatINRCompact(b.avg_payout)}</td>
              <td><Badge active={b.status === 'Active'}>{b.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
