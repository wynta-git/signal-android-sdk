'use client';
import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import {
  selectDashboardAnalytics,
  selectDashboardCampaigns,
  selectDashboardStatus,
} from '../../store/slices/dashboardSlice';

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const COLORS = { sent: '#2563eb', opens: '#22c55e', conversions: '#f59e0b' };
const LEGEND = [
  { key: 'sent',        label: 'Sent (K)',    color: COLORS.sent },
  { key: 'opens',       label: 'Opens (K)',   color: COLORS.opens },
  { key: 'conversions', label: 'Conversions', color: COLORS.conversions },
] as const;

type EnrichedDay = { date: string; sent: number; opens: number; conversions: number };

function yTicks(max: number): number[] {
  if (max === 0) return [0];
  const step = Math.ceil(max / 4 / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max)));
  const ticks: number[] = [];
  for (let v = 0; v <= max + step; v += step) { ticks.push(v); if (ticks.length > 5) break; }
  return ticks;
}

function GroupedBarChart({ data }: { data: EnrichedDay[] }) {
  const W = 800, H = 190, PAD = { top: 10, right: 12, bottom: 34, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.flatMap(d => [d.sent, d.opens, d.conversions]), 1);
  const ticks = yTicks(max);
  const tickMax = ticks[ticks.length - 1];
  const groupW = innerW / data.length;
  const barW   = Math.max(5, Math.min(20, (groupW - 8) / 3));
  const gap    = Math.max(1, (groupW - barW * 3) / 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {ticks.map(t => {
        const y = PAD.top + innerH * (1 - t / tickMax);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="#e5e7eb" strokeWidth={t === 0 ? 1 : 0.5} strokeDasharray={t === 0 ? undefined : '4,3'} />
            <text x={PAD.left - 5} y={y + 3.5} fontSize={9} fill="#9ca3af" textAnchor="end">{fmt(t)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const gx = PAD.left + i * groupW;
        const series: Array<[number, string]> = [
          [d.sent, COLORS.sent], [d.opens, COLORS.opens], [d.conversions, COLORS.conversions],
        ];
        return (
          <g key={d.date}>
            {series.map(([val, color], si) => {
              const x = gx + gap + si * (barW + gap);
              const h = Math.max(2, (val / tickMax) * innerH);
              const y = PAD.top + innerH - h;
              return <rect key={si} x={x} y={y} width={barW} height={h} rx={2} fill={color} />;
            })}
            <text x={gx + groupW / 2} y={H - PAD.bottom + 13} fontSize={9} fill="#9ca3af" textAnchor="middle">
              {d.date.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MultiLineChart({ data }: { data: EnrichedDay[] }) {
  const W = 800, H = 190, PAD = { top: 10, right: 12, bottom: 34, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.flatMap(d => [d.sent, d.opens, d.conversions]), 1);
  const ticks = yTicks(max);
  const tickMax = ticks[ticks.length - 1];
  const n = data.length;

  const pts = (key: keyof EnrichedDay) =>
    data.map((d, i) => {
      const x = PAD.left + (i / Math.max(n - 1, 1)) * innerW;
      const y = PAD.top + innerH - ((d[key] as number) / tickMax) * innerH;
      return `${x},${y}`;
    }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {ticks.map(t => {
        const y = PAD.top + innerH * (1 - t / tickMax);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="#e5e7eb" strokeWidth={0.5} strokeDasharray="4,3" />
            <text x={PAD.left - 5} y={y + 3.5} fontSize={9} fill="#9ca3af" textAnchor="end">{fmt(t)}</text>
          </g>
        );
      })}
      {(['sent', 'opens', 'conversions'] as const).map(key => (
        <polyline key={key} points={pts(key)} fill="none"
          stroke={COLORS[key]} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {data.map((d, i) => {
        const x = PAD.left + (i / Math.max(n - 1, 1)) * innerW;
        return (
          <text key={d.date} x={x} y={H - PAD.bottom + 13} fontSize={9} fill="#9ca3af" textAnchor="middle">
            {d.date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

function BarIcon({ active }: { active: boolean }) {
  const c = active ? '#fff' : '#6b7280';
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="9" width="3" height="5" rx="0.5" fill={c} />
      <rect x="6" y="5" width="3" height="9" rx="0.5" fill={c} />
      <rect x="11" y="2" width="3" height="12" rx="0.5" fill={c} />
    </svg>
  );
}

function TrendIcon({ active }: { active: boolean }) {
  const c = active ? '#fff' : '#6b7280';
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <polyline points="1,13 5,8 9,10 14,3" stroke={c} strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points="10,3 14,3 14,7" stroke={c} strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function peakDayLabel(date: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const [y, m, d] = date.split('-').map(Number);
  const idx = new Date(y, m - 1, d).getDay();
  return days[idx] ?? date.slice(5);
}

export default function AnalyticsChart() {
  const analytics = useAppSelector(selectDashboardAnalytics);
  const campaigns  = useAppSelector(selectDashboardCampaigns);
  const status     = useAppSelector(selectDashboardStatus);
  const loading    = status.analytics === 'loading';
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  const daily = analytics?.daily ?? [];
  const mtd   = analytics?.mtd;

  const openRate = (mtd?.avg_open_rate?.tracked && mtd.avg_open_rate.value != null && mtd.avg_open_rate.value > 0)
    ? mtd.avg_open_rate.value / 100 : 0.32;
  const ctrRate  = (mtd?.avg_ctr?.tracked && mtd.avg_ctr.value != null && mtd.avg_ctr.value > 0)
    ? mtd.avg_ctr.value / 100 : 0.08;

  const enriched: EnrichedDay[] = daily.map(d => ({
    date: d.date,
    sent: d.sent,
    opens: Math.round(d.sent * openRate),
    conversions: Math.round(d.sent * ctrRate),
  }));

  const bestCampaign = campaigns?.items
    ?.filter(c => c.open_rate != null)
    ?.sort((a, b) => (b.open_rate ?? 0) - (a.open_rate ?? 0))[0] ?? null;

  const peakDay = enriched.length > 0
    ? enriched.reduce((best, d) => d.sent > best.sent ? d : best, enriched[0])
    : null;
  const avgSent  = enriched.length > 0 ? enriched.reduce((s, d) => s + d.sent, 0) / enriched.length : 0;
  const peakPct  = peakDay && avgSent > 0 ? Math.round(((peakDay.sent - avgSent) / avgSent) * 100) : 0;
  const avgCtr   = (mtd?.avg_ctr?.tracked && mtd.avg_ctr.value != null)
    ? `${mtd.avg_ctr.value.toFixed(1)}%` : '—';

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 30, height: 30,
    border: `1px solid ${active ? 'var(--crm-blue)' : 'var(--crm-border)'}`,
    borderRadius: 5, cursor: 'pointer',
    background: active ? 'var(--crm-blue)' : 'var(--crm-white)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  const summaryCards = [
    {
      label: 'Best Campaign',
      value: bestCampaign?.name ?? '—',
      sub:   bestCampaign ? `${bestCampaign.open_rate?.toFixed(0)}% open rate` : 'No campaign data',
    },
    {
      label: 'Peak Day',
      value: peakDay ? peakDayLabel(peakDay.date) : '—',
      sub:   peakPct > 0 ? `${peakPct}% more sends` : 'No data',
    },
    {
      label: 'Avg. CTR',
      value: avgCtr,
      sub:   'across all channels',
    },
  ];

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--crm-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--crm-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="9" width="3" height="5" rx="0.5" fill="var(--crm-blue)" />
            <rect x="6" y="5" width="3" height="9" rx="0.5" fill="var(--crm-blue)" />
            <rect x="11" y="2" width="3" height="12" rx="0.5" fill="var(--crm-blue)" />
          </svg>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>Campaign Analytics</h2>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
            <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
            <text x="7" y="11" fontSize="8" fill="#9ca3af" textAnchor="middle">i</text>
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={btnStyle(chartType === 'bar')} onClick={() => setChartType('bar')} title="Bar chart">
            <BarIcon active={chartType === 'bar'} />
          </button>
          <button style={btnStyle(chartType === 'line')} onClick={() => setChartType('line')} title="Trend">
            <TrendIcon active={chartType === 'line'} />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: '12px 14px 0' }}>
        {loading && <div style={{ height: 190, background: 'var(--g100)', borderRadius: 6 }} />}
        {!loading && enriched.length === 0 && (
          <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--crm-fg4)' }}>No analytics data available</span>
          </div>
        )}
        {!loading && enriched.length > 0 && (
          chartType === 'bar'
            ? <GroupedBarChart data={enriched} />
            : <MultiLineChart  data={enriched} />
        )}
      </div>

      {/* Legend */}
      {!loading && enriched.length > 0 && (
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', padding: '8px 0 10px' }}>
          {LEGEND.map(l => (
            <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--crm-fg3)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        margin: '0 14px 14px', paddingTop: 10,
        borderTop: '1px solid var(--crm-border)',
      }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{
            background: 'var(--crm-bg)', borderRadius: 4, padding: '8px 10px',
          }}>
            <div style={{ fontSize: 10, color: 'var(--crm-fg3)', marginBottom: 2 }}>{card.label}</div>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--crm-fg1)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {card.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--crm-fg3)' }}>{card.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
