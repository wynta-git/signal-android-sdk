'use client';
import BudgetRing from './BudgetRing';
import { formatINRCompact, formatRelative } from '@/services/mocks/utils';

export default function BudgetGrid({ budget }) {
  if (!budget || budget.length === 0) {
    return (
      <div style={{ padding: 20, border: '1px dashed var(--g200)', borderRadius: 'var(--rl)', textAlign: 'center', fontSize: 12, color: 'var(--g400)' }}>
        No budget caps configured.
      </div>
    );
  }
  const order = { DAILY: 0, WEEKLY: 1, MONTHLY: 2 };
  const sorted = [...budget].sort((a, b) => (order[a.period_type] ?? 9) - (order[b.period_type] ?? 9));
  return (
    <div className="ring-grid">
      {sorted.map(b => (
        <div key={b.period_type} className="ring-card">
          <BudgetRing used={b.used} limit={b.limit} />
          <div className="ring-text">
            <div className="period">{b.period_type}</div>
            <div className="ring-used">{formatINRCompact(b.used)}</div>
            <div className="ring-limit">of {b.limit === null ? 'unlimited' : formatINRCompact(b.limit)}</div>
            {b.reset_at && <div className="ring-reset">Resets {formatRelative(b.reset_at)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
