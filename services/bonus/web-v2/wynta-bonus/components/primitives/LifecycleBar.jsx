'use client';
import { useState, useEffect } from 'react';
import { LIFECYCLE_STATES } from '@/services/mocks/lifecycle';
import { STATE_META } from '@/services/mocks/history';
import { usageGranted, formatINRCompact } from '@/services/mocks/utils';

export default function LifecycleBar({ usage, size = 'lg' }) {
  const granted = usageGranted(usage);
  const [animIn, setAnimIn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimIn(true), 30);
    return () => clearTimeout(t);
  }, [granted]);

  if (granted === 0) {
    return (
      <div className={'lifecycle-bar empty ' + size}>
        <div className="lc-track" style={{ background: 'var(--g100)' }}/>
        {size === 'lg' && <div className="lc-empty-text">No grants yet on this bonus.</div>}
      </div>
    );
  }

  const segs = LIFECYCLE_STATES.map(state => {
    const amt = parseFloat(usage.states[state].amount) || 0;
    const pct = granted > 0 ? (amt / granted) * 100 : 0;
    return { state, amount: amt, count: usage.states[state].count, pct };
  });

  return (
    <div className={'lifecycle-bar ' + size}>
      <div className="lc-track">
        {segs.map(s => (
          s.pct > 0 ? (
            <div
              key={s.state}
              className="lc-seg"
              style={{
                width: animIn ? s.pct + '%' : 0,
                background: STATE_META[s.state].color,
              }}
              title={`${STATE_META[s.state].label} · ${s.count} · ${formatINRCompact(s.amount)}`}
            />
          ) : null
        ))}
      </div>
    </div>
  );
}
