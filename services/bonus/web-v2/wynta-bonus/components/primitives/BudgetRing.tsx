'use client';
import { useState, useEffect } from 'react';

interface BudgetRingProps {
  used?: string | number;
  limit?: string | number | null;
  size?: number;
  stroke?: number;
}

export default function BudgetRing({ used, limit, size = 64, stroke = 5 }: BudgetRingProps) {
  const r = (size - stroke) / 2 - 2;
  const C = 2 * Math.PI * r;
  const usedN = parseFloat(String(used || '0')) || 0;
  const limitN = limit === null ? null : (parseFloat(String(limit)) || 0);
  const pct = limitN === null || limitN === 0 ? null : Math.min(1, usedN / limitN);

  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(pct === null ? 0 : pct), 30);
    return () => clearTimeout(t);
  }, [pct]);

  let color = 'var(--g300)';
  if (pct !== null) {
    if (pct < 0.6)      color = 'var(--ok)';
    else if (pct < 0.8) color = 'var(--warn)';
    else                color = 'var(--err)';
  }

  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--g150)" strokeWidth={stroke}/>
      {pct !== null && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - animated)}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.3s' }}
        />
      )}
      <text
        x={cx} y={cy + 4}
        textAnchor="middle"
        fontSize="12.5"
        fill="var(--g700)"
        fontWeight="700"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {pct === null ? '∞' : `${Math.round(pct * 100)}%`}
      </text>
    </svg>
  );
}
