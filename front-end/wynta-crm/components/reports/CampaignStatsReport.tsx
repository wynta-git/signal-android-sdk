'use client';
import { useEffect, useState, useCallback } from 'react';
import { getCampaignStats } from '../../services/reportsApi';
import type { CampaignStatsData, TrendPoint, CampaignRow } from '../../services/reportsApi';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, currency = false): string {
  if (n == null) return '—';
  const prefix = currency ? '₹' : '';
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return n >= 10_000 ? `${prefix}${Math.round(n / 1_000)}K` : `${prefix}${n.toLocaleString()}`;
  return `${prefix}${n.toLocaleString()}`;
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}
function fmtAxis(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function yTicks(max: number): number[] {
  if (max === 0) return [0];
  const mag  = Math.pow(10, Math.floor(Math.log10(max)));
  const step = Math.ceil(max / 4 / mag) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step; v += step) { ticks.push(v); if (ticks.length > 5) break; }
  return ticks;
}

function channelColor(ch: string): string {
  const map: Record<string, string> = {
    email: '#0ea5e9', push: '#8b5cf6', sms: '#f59e0b',
    whatsapp: '#22c55e', telegram: '#3b82f6', in_app: '#ec4899',
  };
  return map[ch] ?? '#94a3b8';
}

function StatusBadge({ status }: { status: string }) {
  const live    = status === 'running' || status === 'scheduled';
  const paused  = status === 'paused';
  const color   = live ? '#17A552' : paused ? '#f59e0b' : '#9AA0A6';
  const bg      = live ? '#E6F6EC' : paused ? '#fef3c7' : '#f1f5f9';
  const label   = live ? 'Live' : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color, background: bg, borderRadius: 20, padding: '3px 9px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────────

const TIER_COLORS = { primary: '#0091E0', secondary: '#22c55e', tertiary: '#f59e0b' };
const TIER_LABELS = { primary: 'Email', secondary: 'Push', tertiary: 'SMS' };

function GroupedBarChart({ data }: { data: TrendPoint[] }) {
  const W = 800, H = 240, PAD = { top: 16, right: 12, bottom: 44, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max    = Math.max(...data.flatMap(d => [d.primary, d.secondary, d.tertiary]), 1);
  const ticks  = yTicks(max);
  const tickMax = ticks[ticks.length - 1];
  const groupW  = innerW / data.length;
  const barW    = Math.max(6, Math.min(32, (groupW * 0.75) / 3));
  const gap     = Math.max(2, (groupW - barW * 3) / 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {ticks.map(t => {
        const y = PAD.top + innerH * (1 - t / tickMax);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="#e5e7eb" strokeWidth={t === 0 ? 1 : 0.5} strokeDasharray={t === 0 ? undefined : '4,3'} />
            <text x={PAD.left - 5} y={y + 3.5} fontSize={9} fill="#6b7280" textAnchor="end">{fmtAxis(t)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const gx = PAD.left + i * groupW;
        const series: Array<[number, string]> = [
          [d.primary,   TIER_COLORS.primary],
          [d.secondary, TIER_COLORS.secondary],
          [d.tertiary,  TIER_COLORS.tertiary],
        ];
        return (
          <g key={d.date}>
            {series.map(([val, color], si) => {
              const x = gx + gap + si * (barW + gap);
              const h = Math.max(2, (val / tickMax) * innerH);
              const y = PAD.top + innerH - h;
              return <rect key={si} x={x} y={y} width={barW} height={h} rx={2} fill={color} />;
            })}
            <text x={gx + groupW / 2} y={PAD.top + innerH + 13} fontSize={9} fill="#6b7280" textAnchor="middle">
              {d.date.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data }: { data: TrendPoint[] }) {
  const W = 800, H = 240, PAD = { top: 16, right: 12, bottom: 44, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max     = Math.max(...data.flatMap(d => [d.primary, d.secondary, d.tertiary]), 1);
  const ticks   = yTicks(max);
  const tickMax = ticks[ticks.length - 1];
  const n = data.length;

  const pts = (key: keyof TrendPoint) =>
    data.map((d, i) => {
      const x = PAD.left + (i / Math.max(n - 1, 1)) * innerW;
      const y = PAD.top + innerH - ((d[key] as number) / tickMax) * innerH;
      return `${x},${y}`;
    }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {ticks.map(t => {
        const y = PAD.top + innerH * (1 - t / tickMax);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#e5e7eb" strokeWidth={0.5} strokeDasharray="4,3" />
            <text x={PAD.left - 5} y={y + 3.5} fontSize={9} fill="#6b7280" textAnchor="end">{fmtAxis(t)}</text>
          </g>
        );
      })}
      {(['primary', 'secondary', 'tertiary'] as const).map(key => (
        <polyline key={key} points={pts(key)} fill="none"
          stroke={TIER_COLORS[key]} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {data.map((d, i) => {
        const x = PAD.left + (i / Math.max(n - 1, 1)) * innerW;
        return (
          <text key={d.date} x={x} y={PAD.top + innerH + 13} fontSize={9} fill="#6b7280" textAnchor="middle">
            {d.date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

interface CardProps { label: string; value: string; change?: number | null; unit?: string; loading?: boolean; }

function SummaryCard({ label, value, change, unit, loading }: CardProps) {
  const isPos = change != null && change > 0;
  return (
    <div style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginBottom: 8 }}>{label}</div>
      {loading
        ? <div style={{ height: 28, width: '60%', background: 'var(--g100)', borderRadius: 4, marginBottom: 6 }} />
        : <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--crm-fg1)', marginBottom: 4 }}>{value}</div>
      }
      {!loading && change != null && (
        <div style={{ fontSize: 12, fontWeight: 500, color: isPos ? 'var(--crm-positive)' : 'var(--crm-negative)' }}>
          {isPos ? '↑' : '↓'} {Math.abs(change).toFixed(1)}{unit ?? '%'}
        </div>
      )}
      {!loading && change == null && (
        <div style={{ fontSize: 11, color: 'var(--crm-positive)' }}>Pending data</div>
      )}
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(rows: CampaignRow[]) {
  const header = 'Campaign,Channel,Sent,Open Rate,CTR,Conversions,Status';
  const lines  = rows.map(r =>
    `"${r.name}",${r.channel},${r.sent},${r.open_rate != null ? (r.open_rate * 100).toFixed(1) + '%' : '—'},${r.ctr != null ? (r.ctr * 100).toFixed(1) + '%' : '—'},${r.conversions ?? '—'},${r.status}`
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'campaign-stats.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { onOpenBuilder: () => void; }

const WINDOW_OPTIONS = [
  { label: 'Last 7 days',  value: 7  },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];
const CHANNEL_OPTIONS = [
  { label: 'All Channels', value: 'all'      },
  { label: 'Push',         value: 'push'     },
  { label: 'Email',        value: 'email'    },
  { label: 'SMS',          value: 'sms'      },
  { label: 'WhatsApp',     value: 'whatsapp' },
  { label: 'In-App',       value: 'in_app'   },
];

type SortKey = 'name' | 'channel' | 'sent' | 'open_rate' | 'ctr' | 'conversions';

export default function CampaignStatsReport({ onOpenBuilder }: Props) {
  const [windowDays, setWindowDays] = useState(7);
  const [channel,    setChannel]    = useState('all');
  const [data,       setData]       = useState<CampaignStatsData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [chartType,  setChartType]  = useState<'bar' | 'line'>('bar');
  const [sortKey,    setSortKey]    = useState<SortKey>('sent');
  const [sortAsc,    setSortAsc]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCampaignStats(PROJECT_ID, { windowDays, channel, segmentId: null });
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [windowDays, channel]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  const summaryCards: CardProps[] = [
    { label: 'Total Sent',          value: fmt(s?.total_sent?.value),                    change: s?.total_sent?.change_pct },
    { label: 'Avg Open Rate',       value: s?.avg_open_rate?.tracked ? fmtPct(s.avg_open_rate.value) : '—', change: s?.avg_open_rate?.change_pct },
    { label: 'Avg CTR',             value: s?.avg_ctr?.tracked ? fmtPct(s.avg_ctr.value) : '—',             change: s?.avg_ctr?.change_pct },
    { label: 'Conversions',         value: fmt(s?.conversions?.value),                  change: s?.conversions?.change_pct },
    { label: 'Revenue Influenced',  value: fmt(s?.revenue_influenced?.value, true),     change: s?.revenue_influenced?.change_pct },
  ];

  const sortedCampaigns = [...(data?.campaigns ?? [])].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  }

  const selectStyle: React.CSSProperties = {
    padding: '6px 28px 6px 10px', border: '1px solid var(--crm-border)', borderRadius: 7,
    fontSize: 13, color: 'var(--crm-fg2)', background: 'var(--crm-white)', cursor: 'pointer', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
  };

  const btnToggle = (active: boolean): React.CSSProperties => ({
    width: 30, height: 30, border: `1px solid ${active ? 'var(--crm-blue)' : 'var(--crm-border)'}`,
    borderRadius: 5, cursor: 'pointer', background: active ? 'var(--crm-blue)' : 'var(--crm-white)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  const TH = (key: SortKey, label: string) => (
    <th
      key={key}
      onClick={() => handleSort(key)}
      style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-bg)', userSelect: 'none' }}
    >
      {label} {sortKey === key ? (sortAsc ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '18px 28px 14px', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-white)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
                <rect x="1" y="9" width="3" height="5" rx="0.5" fill="var(--crm-blue)" />
                <rect x="6" y="5" width="3" height="9" rx="0.5" fill="var(--crm-blue)" />
                <rect x="11" y="2" width="3" height="12" rx="0.5" fill="var(--crm-blue)" />
              </svg>
              <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--crm-fg1)' }}>Campaign Stats Report</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginTop: 3 }}>Delivery, open, and conversion metrics across all campaigns</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} style={selectStyle}>
                {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <select value={channel} onChange={e => setChannel(e.target.value)} style={selectStyle}>
                {CHANNEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <button
              onClick={() => data && exportCsv(data.campaigns)}
              style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--crm-border)', background: 'var(--crm-white)', color: 'var(--crm-fg2)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              ↓ Export
            </button>
            <button
              onClick={onOpenBuilder}
              style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--crm-blue)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              + Custom Report
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          {summaryCards.map(c => <SummaryCard key={c.label} {...c} loading={loading} />)}
        </div>

        {/* Trend chart */}
        <div style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                <rect x="1" y="9" width="3" height="5" rx="0.5" fill="var(--crm-blue)" />
                <rect x="6" y="5" width="3" height="9" rx="0.5" fill="var(--crm-blue)" />
                <rect x="11" y="2" width="3" height="12" rx="0.5" fill="var(--crm-blue)" />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-fg1)' }}>Trend</span>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
                <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
                <text x="7" y="11" fontSize="8" fill="#9ca3af" textAnchor="middle">i</text>
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button style={btnToggle(chartType === 'bar')} onClick={() => setChartType('bar')} title="Bar chart">
                <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                  <rect x="1" y="9" width="3" height="5" rx="0.5" fill={chartType === 'bar' ? '#fff' : '#6b7280'} />
                  <rect x="6" y="5" width="3" height="9" rx="0.5" fill={chartType === 'bar' ? '#fff' : '#6b7280'} />
                  <rect x="11" y="2" width="3" height="12" rx="0.5" fill={chartType === 'bar' ? '#fff' : '#6b7280'} />
                </svg>
              </button>
              <button style={btnToggle(chartType === 'line')} onClick={() => setChartType('line')} title="Line chart">
                <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                  <polyline points="1,13 5,8 9,10 14,3" stroke={chartType === 'line' ? '#fff' : '#6b7280'} strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
          <div style={{ padding: '12px 18px 0', height: 240 }}>
            {loading && <div style={{ height: '100%', background: 'var(--g100)', borderRadius: 6 }} />}
            {!loading && data && data.trend.length > 0 && (
              chartType === 'bar'
                ? <GroupedBarChart data={data.trend} />
                : <LineChart       data={data.trend} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', padding: '10px 0 14px' }}>
            {(Object.entries(TIER_LABELS) as [keyof typeof TIER_COLORS, string][]).map(([key, label]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: TIER_COLORS[key] }} />
                <span style={{ fontSize: 11, color: 'var(--crm-fg3)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Data table */}
        <div style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--crm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-fg1)' }}>Data Table</span>
            <button
              onClick={() => data && exportCsv(data.campaigns)}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--crm-border)', background: 'var(--crm-white)', color: 'var(--crm-fg2)', fontSize: 12, cursor: 'pointer' }}
            >
              ↓ CSV
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {TH('name',        'Campaign'   )}
                  {TH('channel',     'Channel'    )}
                  {TH('sent',        'Sent'       )}
                  {TH('open_rate',   'Open Rate'  )}
                  {TH('ctr',         'CTR'        )}
                  {TH('conversions', 'Conversions')}
                  <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', textAlign: 'left', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-bg)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 14px', borderBottom: '1px solid var(--crm-border)' }}>
                        <div style={{ height: 12, background: 'var(--g100)', borderRadius: 3, width: j === 0 ? '80%' : '50%' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && sortedCampaigns.map((row, i) => (
                  <tr key={row.campaign_id} style={{ background: i % 2 === 0 ? 'var(--crm-white)' : 'transparent' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg1)', fontWeight: 500, borderBottom: '1px solid var(--crm-border)' }}>{row.name}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, borderBottom: '1px solid var(--crm-border)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: channelColor(row.channel), flexShrink: 0 }} />
                        <span style={{ color: 'var(--crm-fg2)', textTransform: 'capitalize' }}>{row.channel.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>{fmt(row.sent)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>
                      {row.open_rate != null ? fmtPct(row.open_rate) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>
                      {row.ctr != null ? fmtPct(row.ctr) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>
                      {row.conversions != null ? row.conversions.toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--crm-border)' }}>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
                {!loading && sortedCampaigns.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--crm-fg4)' }}>No campaigns found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!loading && sortedCampaigns.length > 0 && (
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--crm-border)', fontSize: 12, color: 'var(--crm-fg3)' }}>
              Showing {sortedCampaigns.length} campaign{sortedCampaigns.length !== 1 ? 's' : ''} —{' '}
              <span style={{ color: 'var(--crm-blue)', cursor: 'pointer' }} onClick={() => data && exportCsv(data.campaigns)}>Export full dataset</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
