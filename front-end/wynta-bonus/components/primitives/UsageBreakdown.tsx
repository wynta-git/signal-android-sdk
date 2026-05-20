'use client';
import { useState } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import LifecycleBar from './LifecycleBar';
import type { UsageData } from './LifecycleBar';
import { LIFECYCLE_STATES } from '../../services/mocks/lifecycle';
import { STATE_META } from '../../services/mocks/history';
import { usageGranted, formatINRCompact } from '../../services/mocks/utils';

interface UsagePeriodEntry {
  id: string;
  label: string;
  factor: number;
  hint: string;
}

const USAGE_PERIODS: UsagePeriodEntry[] = [
  { id: 'ALL',     label: 'All-time', factor: 1.0,   hint: 'lifetime' },
  { id: 'MONTHLY', label: 'Monthly',  factor: 0.42,  hint: 'last 30 days' },
  { id: 'WEEKLY',  label: 'Weekly',   factor: 0.12,  hint: 'last 7 days' },
  { id: 'DAILY',   label: 'Daily',    factor: 0.028, hint: 'last 24 hours' },
];

function scaleUsage(usage: UsageData, factor: number): UsageData {
  if (!usage || factor === 1.0) return usage;
  const out: UsageData = { states: {} };
  for (const s of LIFECYCLE_STATES as string[]) {
    const orig = usage.states[s] || { count: 0, amount: '0' };
    out.states[s] = {
      count: Math.round((orig.count || 0) * factor),
      amount: ((parseFloat(String(orig.amount)) || 0) * factor).toFixed(2),
    };
  }
  return out;
}

function summarizeCount(usage: UsageData): string {
  let n = 0;
  for (const s of LIFECYCLE_STATES as string[]) n += usage.states[s].count;
  return n.toLocaleString('en-IN');
}

interface UsageBreakdownProps {
  usage: UsageData;
  dense?: boolean;
}

export default function UsageBreakdown({ usage, dense = false }: UsageBreakdownProps) {
  const [period, setPeriod] = useState('ALL');
  const cfg = USAGE_PERIODS.find(p => p.id === period) || USAGE_PERIODS[0];
  const scaled = scaleUsage(usage, cfg.factor);
  const granted = usageGranted(scaled);
  const fullGranted = usageGranted(usage);

  if (fullGranted === 0) {
    return (
      <div className="usage-empty">
        <Icon name="inbox" size={20} color="var(--g300)"/>
        <div>
          <div className="title">No grants yet</div>
          <div className="hint">Lifecycle counts will appear here once the bonus starts releasing.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="usage-breakdown">
      <div className="usage-period-tabs" role="tablist" aria-label="Usage period">
        {USAGE_PERIODS.map(p => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={period === p.id}
            className={'usage-period-tab' + (period === p.id ? ' active' : '')}
            onClick={() => setPeriod(p.id)}
            title={p.hint}
          >
            {p.label}
          </button>
        ))}
        <span className="usage-period-hint">· {cfg.hint}</span>
      </div>
      {!dense && (
        <div className="usage-total">
          <div className="usage-total-num">{granted > 0 ? formatINRCompact(granted) : '—'}</div>
          <div className="usage-total-label">
            {granted > 0
              ? <>Granted across {summarizeCount(scaled)} grants <span style={{ color: 'var(--g400)' }}>· {cfg.label.toLowerCase()}</span></>
              : <>No grants in this period</>}
          </div>
        </div>
      )}
      <LifecycleBar usage={scaled} size={dense ? 'sm' : 'lg'}/>
      <div className={'usage-chips' + (dense ? ' dense' : '')}>
        {(LIFECYCLE_STATES as string[]).map(s => {
          const v = scaled.states[s];
          return (
            <div key={s} className="usage-chip">
              <span className="dot" style={{ background: STATE_META[s].color }}/>
              <div className="kv">
                <div className="k">{STATE_META[s].label}</div>
                <div className="v">{formatINRCompact(v.amount)} <span className="ct">· {v.count}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
