'use client';
import { useState, useEffect } from 'react';
import { formatDate, formatRelative } from '../utils';

interface ValidityBarProps {
  start: string;
  end: string;
}

export default function ValidityBar({ start, end }: ValidityBarProps) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const today = Date.now();

  const totalRange = endMs - startMs;
  const elapsed = Math.max(0, Math.min(totalRange, today - startMs));
  const pct = totalRange > 0 ? (elapsed / totalRange) * 100 : 0;
  const finalPct = Math.max(0, Math.min(100, pct));
  const status = today < startMs ? 'upcoming' : today > endMs ? 'ended' : 'active';

  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(finalPct), 30);
    return () => clearTimeout(t);
  }, [finalPct]);

  return (
    <div>
      <div className="validity-bar">
        <div className="fill" style={{ width: animated + '%' }} />
        {status === 'active' && <>
          <div className="marker" style={{ left: animated + '%' }} />
          <div className="today" style={{ left: animated + '%' }}>Today · {Math.round(animated)}%</div>
        </>}
        {status === 'upcoming' && <div className="today" style={{ left: 0 }}>Starts {formatRelative(start)}</div>}
        {status === 'ended' && <div className="today" style={{ left: '100%', transform: 'translateX(-100%)' }}>Ended {formatRelative(end)}</div>}
      </div>
      <div className="validity-labels">
        <span>{formatDate(start)}</span>
        <span>{formatDate(end)}</span>
      </div>
    </div>
  );
}
