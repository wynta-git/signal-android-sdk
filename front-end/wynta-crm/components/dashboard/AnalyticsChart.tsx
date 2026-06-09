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
  { key: 'sent',        label: 'Sent (K)',     color: COLORS.sent },
  { key: 'opens',       label: 'Opens (K)',    color: COLORS.opens },
  { key: 'conversions', label: 'Conversions',  color: COLORS.conversions },
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
  const W = 800, H = 240, PAD = { top: 14, right: 16, bottom: 52, left: 58 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.flatMap(d => [d.sent, d.opens, d.conversions]), 1);
  const ticks = yTicks(max);
  const tickMax = ticks[ticks.length - 1];

  const groupW = innerW / data.length;
  const barW   = Math.max(5, Math.min(18, (groupW - 6) / 3));
  const gap    = Math.max(1, (groupW - barW * 3) / 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {/* Y-axis label */}
      <text
        x={12} y={PAD.top + innerH / 2}
        fontSize={10} fill="#111827" textAnchor="middle"
        transform={`rotate(-90, 12, ${PAD.top + innerH / 2})`}
      >
        Count
      </text>
      {/* X-axis label */}
      <text x={PAD.left + innerW / 2} y={H - 4} fontSize={10} fill="#111827" textAnchor="middle">
        Date
      </text>
      {ticks.map(t => {
        const y = PAD.top + innerH * (1 - t / tickMax);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="#e5e7eb" strokeWidth={t === 0 ? 1 : 0.5} strokeDasharray={t === 0 ? undefined : '4,3'} />
            <text x={PAD.left - 6} y={y + 4} fontSize={9} fill="#111827" textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const gx = PAD.left + i * groupW;
        const series: Array<[number, string]> = [[d.sent, COLORS.sent], [d.opens, COLORS.opens], [d.conversions, COLORS.conversions]];
        return (
          <g key={d.date}>
            {series.map(([val, color], si) => {
              const x = gx + gap + si * (barW + gap);
              const h = Math.max(2, (val / tickMax) * innerH);
              const y = PAD.top + innerH - h;
              return <rect key={si} x={x} y={y} width={barW} height={h} rx={2} fill={color} />;
            })}
            <text x={gx + groupW / 2} y={H - PAD.bottom + 14} fontSize={9} fill="#111827" textAnchor="middle">
              {d.date.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MultiLineChart({ data }: { data: EnrichedDay[] }) {
  const W = 800, H = 240, PAD = { top: 14, right: 16, bottom: 52, left: 58 };
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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {/* Y-axis label */}
      <text
        x={12} y={PAD.top + innerH / 2}
        fontSize={10} fill="#111827" textAnchor="middle"
        transform={`rotate(-90, 12, ${PAD.top + innerH / 2})`}
      >
        Count
      </text>
      {/* X-axis label */}
      <text x={PAD.left + innerW / 2} y={H - 4} fontSize={10} fill="#111827" textAnchor="middle">
        Date
      </text>
      {ticks.map(t => {
        const y = PAD.top + innerH * (1 - t / tickMax);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="#e5e7eb" strokeWidth={0.5} strokeDasharray="4,3" />
            <text x={PAD.left - 6} y={y + 4} fontSize={9} fill="#111827" textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        );
      })}
      {(['sent', 'opens', 'conversions'] as const).map(key => (
        <polyline key={key} points={pts(key)} fill="none"
          stroke={COLORS[key]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {data.map((d, i) => {
        const x = PAD.left + (i / Math.max(n - 1, 1)) * innerW;
        return (
          <text key={d.date} x={x} y={H - PAD.bottom + 14} fontSize={9} fill="#111827" textAnchor="middle">
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
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="9" width="3" height="5" rx="0.5" fill={c} />
      <rect x="6" y="5" width="3" height="9" rx="0.5" fill={c} />
      <rect x="11" y="2" width="3" height="12" rx="0.5" fill={c} />
    </svg>
  );
}

function TrendIcon({ active }: { active: boolean }) {
  const c = active ? '#fff' : '#6b7280';
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <polyline points="1,13 5,8 9,10 14,3" stroke={c} strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points="10,3 14,3 14,7" stroke={c} strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
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

  // Summary card: best campaign by open rate
  const bestCampaign = campaigns?.items
    ?.filter(c => c.open_rate != null)
    ?.sort((a, b) => (b.open_rate ?? 0) - (a.open_rate ?? 0))[0] ?? null;

  // Summary card: peak day
  const peakDay = enriched.length > 0
    ? enriched.reduce((best, d) => d.sent > best.sent ? d : best, enriched[0])
    : null;
  const avgSent = enriched.length > 0 ? enriched.reduce((s, d) => s + d.sent, 0) / enriched.length : 0;
  const peakPct = peakDay && avgSent > 0 ? Math.round(((peakDay.sent - avgSent) / avgSent) * 100) : 0;

  // Summary card: avg CTR
  const avgCtr = (mtd?.avg_ctr?.tracked && mtd.avg_ctr.value != null)
    ? `${mtd.avg_ctr.value.toFixed(1)}%` : '—';

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 34, height: 34,
    border: `1px solid ${active ? 'var(--crm-blue)' : 'var(--crm-border)'}`,
    borderRadius: 6, cursor: 'pointer',
    background: active ? 'var(--crm-blue)' : 'var(--crm-white)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  });

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        background: 'var(--crm-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid var(--crm-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="9" width="3" height="5" rx="0.5" fill="var(--crm-blue)" />
            <rect x="6" y="5" width="3" height="9" rx="0.5" fill="var(--crm-blue)" />
            <rect x="11" y="2" width="3" height="12" rx="0.5" fill="var(--crm-blue)" />
          </svg>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>
            Campaign Analytics
          </h2>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
            <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
            <text x="7" y="11" fontSize="8" fill="#111827" textAnchor="middle">i</text>
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btnStyle(chartType === 'bar')} onClick={() => setChartType('bar')} title="Bar chart">
            <BarIcon active={chartType === 'bar'} />
          </button>
          <button style={btnStyle(chartType === 'line')} onClick={() => setChartType('line')} title="Trend">
            <TrendIcon active={chartType === 'line'} />
          </button>
        </div>
      </div>

      {/* Chart area */}
      <div style={{ padding: '12px 16px 0' }}>
        {loading && <div style={{ height: 220, background: 'var(--g100)', borderRadius: 8 }} />}

        {!loading && enriched.length === 0 && (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--crm-fg4)' }}>No analytics data available</span>
          </div>
        )}

        {!loading && enriched.length > 0 && (
          chartType === 'bar'
            ? <GroupedBarChart data={enriched} />
            : <MultiLineChart data={enriched} />
        )}
      </div>

      {/* Legend */}
      {!loading && enriched.length > 0 && (
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', padding: '6px 0 10px' }}>
          {LEGEND.map(l => (
            <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
              <span style={{ fontSize: 11, color: 'var(--crm-fg3)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--crm-border)' }} />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
        {[
          {
            label: 'Best Campaign',
            value: bestCampaign?.name ?? '—',
            sub:   bestCampaign ? `${bestCampaign.open_rate?.toFixed(0)}% open rate` : 'No campaign data',
          },
          {
            label: 'Peak Day',
            value: peakDay ? peakDay.date.slice(5) : '—',
            sub:   peakPct > 0 ? `${peakPct}% more sends` : 'No data',
          },
          {
            label: 'Avg. CTR',
            value: avgCtr,
            sub:   'across all channels',
          },
        ].map((card, i) => (
          <div key={card.label} style={{
            padding: '14px 20px',
            borderRight: i < 2 ? '1px solid var(--crm-border)' : undefined,
            background: 'var(--g50, #f9fafb)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--crm-fg4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-fg1)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {card.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--crm-fg4)' }}>{card.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
