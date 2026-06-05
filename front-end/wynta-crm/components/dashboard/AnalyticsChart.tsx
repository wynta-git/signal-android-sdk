'use client';
import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardAnalytics, selectDashboardStatus } from '../../store/slices/dashboardSlice';
import type { DailyAnalytics, TrackedMetric } from '../../services/dashboardApi';

const UNTRACKED_TITLE = 'Not yet tracked — requires provider delivery callbacks';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function TrackedMtdValue({ v }: { v: TrackedMetric | undefined }) {
  if (!v || !v.tracked || v.value === null) {
    return <span title={UNTRACKED_TITLE} style={{ color: 'var(--crm-fg4)', fontSize: 11 }}>—</span>;
  }
  return <>{v.value.toFixed(1)}%</>;
}

function BarChart({ data, field }: { data: DailyAnalytics[]; field: 'sent' | 'delivered' }) {
  const W = 560, H = 140, PAD = { top: 12, right: 8, bottom: 30, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.map(d => d[field]), 1);
  const barW = Math.max(4, innerW / data.length - 3);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {/* Y-axis labels */}
      {[0, 0.5, 1].map(t => {
        const y = PAD.top + innerH * (1 - t);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="var(--g150)" strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={PAD.left - 6} y={y + 4} fontSize={9} fill="var(--crm-fg4)" textAnchor="end">
              {t === 0 ? '0' : fmt(Math.round(max * t))}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const x = PAD.left + (i / data.length) * innerW + 1.5;
        const h = Math.max(2, (d[field] / max) * innerH);
        const y = PAD.top + innerH - h;
        const label = d.date.slice(5); // MM-DD
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={h} rx={2}
              fill="var(--crm-blue)" opacity={0.82} />
            {data.length <= 14 && (
              <text x={x + barW / 2} y={H - PAD.bottom + 12} fontSize={8}
                fill="var(--crm-fg4)" textAnchor="middle">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data, field }: { data: DailyAnalytics[]; field: 'sent' | 'delivered' }) {
  const W = 560, H = 140, PAD = { top: 12, right: 8, bottom: 30, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.map(d => d[field]), 1);

  const pts = data.map((d, i) => {
    const x = PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
    const y = PAD.top + innerH - (d[field] / max) * innerH;
    return `${x},${y}`;
  }).join(' ');

  const areaPts = [
    `${PAD.left},${PAD.top + innerH}`,
    ...data.map((d, i) => {
      const x = PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
      const y = PAD.top + innerH - (d[field] / max) * innerH;
      return `${x},${y}`;
    }),
    `${PAD.left + innerW},${PAD.top + innerH}`,
  ].join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--crm-blue)" stopOpacity={0.15} />
          <stop offset="100%" stopColor="var(--crm-blue)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map(t => {
        const y = PAD.top + innerH * (1 - t);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="var(--g150)" strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={PAD.left - 6} y={y + 4} fontSize={9} fill="var(--crm-fg4)" textAnchor="end">
              {t === 0 ? '0' : fmt(Math.round(max * t))}
            </text>
          </g>
        );
      })}
      <polygon points={areaPts} fill="url(#areaGrad)" />
      <polyline points={pts} fill="none" stroke="var(--crm-blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => {
        const x = PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
        const y = PAD.top + innerH - (d[field] / max) * innerH;
        const label = d.date.slice(5);
        return (
          <g key={d.date}>
            <circle cx={x} cy={y} r={2.5} fill="var(--crm-blue)" />
            {data.length <= 14 && (
              <text x={x} y={H - PAD.bottom + 12} fontSize={8} fill="var(--crm-fg4)" textAnchor="middle">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function AnalyticsChart() {
  const analytics = useAppSelector(selectDashboardAnalytics);
  const status    = useAppSelector(selectDashboardStatus);
  const loading   = status.analytics === 'loading';
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [field, setField]         = useState<'sent' | 'delivered'>('sent');

  const daily = analytics?.daily ?? [];
  const mtd   = analytics?.mtd;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16 }}>
      {/* Chart panel */}
      <div style={{
        background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
        borderRadius: 6, padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)' }}>Campaign Analytics</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Field toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--crm-border)', borderRadius: 6, overflow: 'hidden' }}>
              {(['sent', 'delivered'] as const).map(f => (
                <button key={f} onClick={() => setField(f)} style={{
                  fontSize: 11, padding: '4px 10px', border: 'none', cursor: 'pointer',
                  background: field === f ? 'var(--crm-blue)' : 'transparent',
                  color: field === f ? '#fff' : 'var(--crm-fg3)',
                  fontWeight: field === f ? 600 : 400,
                }}>
                  {f === 'sent' ? 'Sent' : 'Delivered'}
                </button>
              ))}
            </div>
            {/* Chart type toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--crm-border)', borderRadius: 6, overflow: 'hidden' }}>
              {(['bar', 'line'] as const).map(t => (
                <button key={t} onClick={() => setChartType(t)} style={{
                  fontSize: 11, padding: '4px 10px', border: 'none', cursor: 'pointer',
                  background: chartType === t ? 'var(--crm-blue)' : 'transparent',
                  color: chartType === t ? '#fff' : 'var(--crm-fg3)',
                  fontWeight: chartType === t ? 600 : 400,
                }}>
                  {t === 'bar' ? '▐▌' : '~'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <div style={{ height: 140, background: 'var(--g100)', borderRadius: 8 }} />
        )}
        {!loading && daily.length === 0 && (
          <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--crm-fg4)' }}>No analytics data available</span>
          </div>
        )}
        {!loading && daily.length > 0 && (
          chartType === 'bar'
            ? <BarChart data={daily} field={field} />
            : <LineChart data={daily} field={field} />
        )}
      </div>

      {/* MTD panel */}
      <div style={{
        background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
        borderRadius: 6, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)' }}>MTD Summary</h2>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 40, background: 'var(--g100)', borderRadius: 6 }} />
            ))}
          </div>
        )}

        {!loading && mtd && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Total Sent',       value: fmt(mtd.total_sent) },
              { label: 'Total Delivered',  value: fmt(mtd.total_delivered) },
              { label: 'Avg. Open Rate',   value: <TrackedMtdValue v={mtd.avg_open_rate} /> },
              { label: 'Avg. CTR',         value: <TrackedMtdValue v={mtd.avg_ctr} /> },
            ].map(row => (
              <div key={row.label} style={{ borderBottom: '1px solid var(--crm-border)', paddingBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--crm-fg4)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {row.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--crm-fg1)' }}>
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !mtd && (
          <p style={{ fontSize: 12, color: 'var(--crm-fg4)' }}>No MTD data available</p>
        )}
      </div>
    </div>
  );
}
