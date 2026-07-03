'use client';
import { useState } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import { formatINRCompact } from '../../services/mocks/utils';
import type { SpendPeriod } from '../../types';

const PERIOD_TABS = [
  { id: 'DAILY',   label: 'Daily',   hint: 'today' },
  { id: 'WEEKLY',  label: 'Weekly',  hint: 'this week' },
  { id: 'MONTHLY', label: 'Monthly', hint: 'this month' },
] as const;

interface SpendPanelProps {
  spendRows: SpendPeriod[];
}

export default function SpendPanel({ spendRows }: SpendPanelProps) {
  const [period, setPeriod] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('MONTHLY');

  // Most recent row for the selected period type
  const row = spendRows
    .filter(r => r.period_type === period)
    .sort((a, b) => b.period_start.localeCompare(a.period_start))[0] ?? null;

  const tab = PERIOD_TABS.find(t => t.id === period)!;

  if (spendRows.length === 0) {
    return (
      <div className="usage-empty">
        <Icon name="inbox" size={20} color="var(--g300)" />
        <div>
          <div className="title">No spend data yet</div>
          <div className="hint">Spend amounts will appear here once players start consuming bonuses.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="usage-breakdown">
      <div className="usage-period-tabs" role="tablist" aria-label="Spend period">
        {PERIOD_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={period === t.id}
            className={'usage-period-tab' + (period === t.id ? ' active' : '')}
            onClick={() => setPeriod(t.id)}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
        <span className="usage-period-hint">· {tab.hint}</span>
      </div>

      <div className="usage-total">
        <div className="usage-total-num">
          {row ? formatINRCompact(row.total_amount) : '—'}
        </div>
        <div className="usage-total-label">
          {row
            ? <>
                Consumed across {row.consume_count.toLocaleString('en-IN')} event{row.consume_count !== 1 ? 's' : ''}
                <span style={{ color: 'var(--g400)' }}> · {tab.label.toLowerCase()}</span>
              </>
            : <>No consumption in this period</>}
        </div>
      </div>

      {row && (
        <div className="usage-chips">
          <div className="usage-chip">
            <span className="dot" style={{ background: 'var(--accent)' }} />
            <div className="kv">
              <div className="k">Period</div>
              <div className="v">
                {row.period_start}
                {row.period_end !== row.period_start ? ` – ${row.period_end}` : ''}
              </div>
            </div>
          </div>
          <div className="usage-chip">
            <span className="dot" style={{ background: 'var(--success, #22c55e)' }} />
            <div className="kv">
              <div className="k">Total consumed</div>
              <div className="v">
                {formatINRCompact(row.total_amount)}
                <span className="ct"> · {row.consume_count} events</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
