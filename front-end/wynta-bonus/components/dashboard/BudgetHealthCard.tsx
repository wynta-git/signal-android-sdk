'use client';
import { formatINRCompact } from '../../services/mocks/utils';
import type { BonusDashboardBudgetHealthResponse } from '../../types';

interface Props {
  data: BonusDashboardBudgetHealthResponse | null;
  loading: boolean;
}

function barClass(pct: number | null): string {
  if (pct === null) return 'ok';
  if (pct >= 90) return 'critical';
  if (pct >= 70) return 'warn';
  return 'ok';
}

export default function BudgetHealthCard({ data, loading }: Props) {
  const programs = data?.programs ?? [];
  return (
    <div className="dq-card">
      <div className="dq-card-header">
        Budget Health
        <span className="dq-lifecycle-hint">This month</span>
      </div>
      <div className="dq-budget-list">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="dq-skeleton-line" style={{ height: 56, marginBottom: 10 }} />
          ))}
        {!loading && programs.length === 0 && <div className="dq-empty-cell">No budget programs configured</div>}
        {!loading && programs.map((p) => (
          <div className="dq-budget-row" key={`${p.entity_type}-${p.entity_id}`}>
            <div className="dq-budget-row-head">
              <div>
                <div className="dq-budget-name">{p.name}</div>
                {p.owner && <div className="dq-budget-owner">{p.owner}</div>}
              </div>
              {p.monthly_pct !== null && (
                <div className={'dq-budget-pct dq-budget-pct-' + barClass(p.monthly_pct)}>
                  {p.monthly_pct.toFixed(0)}%
                </div>
              )}
            </div>
            <div className="dq-budget-bar-group">
              <div className="dq-budget-bar-label">MONTHLY</div>
              <div className="dq-budget-bar"><div className={barClass(p.monthly_pct)} style={{ width: Math.min(100, p.monthly_pct ?? 0) + '%' }} /></div>
              <div className="dq-budget-bar-amounts">
                {formatINRCompact(p.monthly_used)} {p.monthly_limit !== null ? `of ${formatINRCompact(p.monthly_limit)}` : ''}
              </div>
            </div>
            <div className="dq-budget-bar-group">
              <div className="dq-budget-bar-label">DAILY</div>
              <div className="dq-budget-bar"><div className={barClass(p.daily_pct)} style={{ width: Math.min(100, p.daily_pct ?? 0) + '%' }} /></div>
              <div className="dq-budget-bar-amounts">
                {formatINRCompact(p.daily_used)}{p.daily_limit !== null ? `/day of ${formatINRCompact(p.daily_limit)}` : '/day'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
