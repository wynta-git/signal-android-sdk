'use client';
import { useEffect, useState, useCallback } from 'react';
import { getSegmentAnalysis } from '../../services/reportsApi';
import type { SegmentAnalysisData, SegmentRow } from '../../services/reportsApi';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000)     return n.toLocaleString();
  return String(n);
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}
function StatusBadge({ status }: { status: string }) {
  const live  = status === 'live';
  const color = live ? '#17A552' : '#f59e0b';
  const bg    = live ? '#E6F6EC' : '#fef3c7';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color, background: bg, borderRadius: 20, padding: '3px 9px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {live ? 'Live' : 'Paused'}
    </span>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

interface CardProps { label: string; value: string; change?: number | null; suffix?: string; loading?: boolean; }

function SummaryCard({ label, value, change, suffix, loading }: CardProps) {
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
          {isPos ? '↑' : '↓'} {Math.abs(change).toFixed(1)}{suffix ?? '%'}
        </div>
      )}
      {!loading && change == null && (
        <div style={{ fontSize: 11, color: 'var(--crm-fg3)' }}>Not tracked</div>
      )}
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(rows: SegmentRow[]) {
  const header = 'Segment,Users,7d Growth,Open Rate,Conversion,Status';
  const lines  = rows.map(r =>
    `"${r.name}",${r.users},${r.growth_7d ?? '—'},${r.open_rate != null ? fmtPct(r.open_rate) : '—'},${r.conversion != null ? fmtPct(r.conversion) : '—'},${r.status}`
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'segment-analysis.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { onOpenBuilder: () => void; }

const WINDOW_OPTIONS = [
  { label: 'Last 7 days',  value: 7  },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

type SortKey = 'name' | 'users' | 'growth_7d' | 'open_rate' | 'conversion';

export default function SegmentAnalysisReport({ onOpenBuilder }: Props) {
  const [windowDays,  setWindowDays]  = useState(7);
  const [segmentId,   setSegmentId]   = useState<string | null>(null);
  const [data,        setData]        = useState<SegmentAnalysisData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [sortKey,     setSortKey]     = useState<SortKey>('users');
  const [sortAsc,     setSortAsc]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSegmentAnalysis(PROJECT_ID, { windowDays, segmentId });
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [windowDays, segmentId]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  // Derive segment list for dropdown from first (unfiltered) load
  const allSegmentNames: Array<{ id: string; name: string }> = (data?.segments ?? []).map(r => ({ id: r.segment_id, name: r.name }));

  const summaryCards: CardProps[] = [
    { label: 'Total Segments',   value: fmt(s?.total_segments?.value)  },
    { label: 'Reachable Users',  value: fmt(s?.reachable_users?.value), change: s?.reachable_users?.change_pct },
    { label: 'Segment Growth',   value: s?.segment_growth?.tracked === false ? 'Not tracked' : fmt(s?.segment_growth?.value) },
    { label: 'Avg Segment Size', value: fmt(s?.avg_segment_size?.value), change: s?.avg_segment_size?.change_pct },
    { label: 'Opt-in Rate',      value: s?.opt_in_rate?.tracked === false ? 'Not tracked' : (s?.opt_in_rate?.value != null ? `${s.opt_in_rate.value}%` : '—') },
  ];

  const sortedSegments = [...(data?.segments ?? [])].sort((a, b) => {
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--crm-fg1)' }}>Segment Analysis Report</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginTop: 3 }}>Size, growth, and engagement metrics across all player segments</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} style={selectStyle}>
                {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <select
                value={segmentId ?? ''}
                onChange={e => setSegmentId(e.target.value || null)}
                style={selectStyle}
              >
                <option value="">All Segments</option>
                {allSegmentNames.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => data && exportCsv(data.segments)}
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

        {/* Data table */}
        <div style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--crm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-fg1)' }}>Data Table</span>
            <button
              onClick={() => data && exportCsv(data.segments)}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--crm-border)', background: 'var(--crm-white)', color: 'var(--crm-fg2)', fontSize: 12, cursor: 'pointer' }}
            >
              ↓ CSV
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {TH('name',       'Segment'   )}
                  {TH('users',      'Users'     )}
                  {TH('growth_7d',  '7d Growth' )}
                  {TH('open_rate',  'Open Rate' )}
                  {TH('conversion', 'Conversion')}
                  <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', textAlign: 'left', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-bg)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 14px', borderBottom: '1px solid var(--crm-border)' }}>
                        <div style={{ height: 12, background: 'var(--g100)', borderRadius: 3, width: j === 0 ? '80%' : '50%' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && sortedSegments.map((row, i) => (
                  <tr key={row.segment_id} style={{ background: i % 2 === 0 ? 'var(--crm-white)' : 'transparent' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg1)', fontWeight: 500, borderBottom: '1px solid var(--crm-border)' }}>{row.name}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>{fmt(row.users)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, borderBottom: '1px solid var(--crm-border)' }}>
                      {row.growth_7d != null
                        ? <span style={{ color: row.growth_7d >= 0 ? 'var(--crm-positive)' : 'var(--crm-negative)', fontWeight: 500 }}>
                            {row.growth_7d >= 0 ? '+' : ''}{row.growth_7d.toLocaleString()}
                          </span>
                        : <span style={{ color: 'var(--crm-fg4)' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>
                      {row.open_rate != null ? fmtPct(row.open_rate) : <span style={{ color: 'var(--crm-fg4)' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>
                      {row.conversion != null ? fmtPct(row.conversion) : <span style={{ color: 'var(--crm-fg4)' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--crm-border)' }}>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
                {!loading && sortedSegments.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--crm-fg4)' }}>No segments found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!loading && sortedSegments.length > 0 && (
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--crm-border)', fontSize: 12, color: 'var(--crm-fg3)' }}>
              Showing {sortedSegments.length} segment{sortedSegments.length !== 1 ? 's' : ''} —{' '}
              <span style={{ color: 'var(--crm-blue)', cursor: 'pointer' }} onClick={() => data && exportCsv(data.segments)}>Export full dataset</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
