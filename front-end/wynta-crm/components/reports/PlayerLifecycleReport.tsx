'use client';
import { useEffect, useState, useCallback } from 'react';
import { getPlayerLifecycle } from '../../services/reportsApi';
import type { PlayerLifecycleData, LifecycleStageRow } from '../../services/reportsApi';

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
function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}
function stageColor(stage: string): string {
  const map: Record<string, string> = {
    'Healthy':      '#22c55e',
    'At-Risk':      '#f59e0b',
    'Churned':      '#ef4444',
    'Re-activated': '#3b82f6',
    'New (< 7d)':   '#8b5cf6',
    'VIP Tier':     '#eab308',
  };
  return map[stage] ?? '#94a3b8';
}

// ── Summary cards ─────────────────────────────────────────────────────────────

interface CardProps {
  label:    string;
  value:    string;
  change?:  number | null;
  sub?:     string;
  subColor?: string;
  loading?: boolean;
}

function SummaryCard({ label, value, change, sub, subColor, loading }: CardProps) {
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
          {isPos ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
        </div>
      )}
      {!loading && sub && (
        <div style={{ fontSize: 11, fontWeight: 500, color: subColor ?? 'var(--crm-fg3)' }}>{sub}</div>
      )}
      {!loading && change == null && !sub && (
        <div style={{ fontSize: 11, color: 'var(--crm-fg3)' }}>Pending data</div>
      )}
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(rows: LifecycleStageRow[]) {
  const header = 'Stage,Players,% of Total,Avg Deposits (30d),Days Since Active,CRM Touchpoints';
  const lines  = rows.map(r =>
    `${r.stage},${r.players},${fmtPct(r.pct_of_total)},${fmtCurrency(r.avg_deposits_30d)},${r.days_since_active},${r.crm_touchpoints != null ? r.crm_touchpoints : '—'}`
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'player-lifecycle.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { onOpenBuilder: () => void; }

const WINDOW_OPTIONS = [
  { label: 'Last 7 days',  value: 7  },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

type SortKey = 'stage' | 'players' | 'pct_of_total' | 'avg_deposits_30d' | 'crm_touchpoints';

export default function PlayerLifecycleReport({ onOpenBuilder }: Props) {
  const [windowDays, setWindowDays] = useState(7);
  const [data,       setData]       = useState<PlayerLifecycleData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [sortKey,    setSortKey]    = useState<SortKey>('players');
  const [sortAsc,    setSortAsc]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPlayerLifecycle(PROJECT_ID, { windowDays, segmentId: null });
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  const summaryCards: CardProps[] = [
    {
      label:  'Total Players',
      value:  fmt(s?.total_players?.value),
      change: s?.total_players?.change_pct,
    },
    {
      label:    'Healthy',
      value:    fmt(s?.healthy?.value),
      sub:      s?.healthy?.pct != null ? fmtPct(s.healthy.pct) : undefined,
      subColor: '#22c55e',
    },
    {
      label:    'At-Risk',
      value:    fmt(s?.at_risk?.value),
      sub:      s?.at_risk?.pct != null ? fmtPct(s.at_risk.pct) : undefined,
      subColor: '#f59e0b',
    },
    {
      label:    'Churned',
      value:    fmt(s?.churned?.value),
      sub:      s?.churned?.pct != null ? fmtPct(s.churned.pct) : undefined,
      subColor: '#ef4444',
    },
    {
      label: 'Win-back Rate',
      value: s?.win_back_rate?.value != null ? fmtPct(s.win_back_rate.value) : '—',
      sub:   s?.win_back_rate?.tracked === false ? 'Pending data' : undefined,
    },
  ];

  const sortedStages = [...(data?.stages ?? [])].sort((a, b) => {
    const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5" r="2.5" stroke="var(--crm-blue)" strokeWidth="1.3" />
                <path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="var(--crm-blue)" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M13.5 8.5l1.5 1.5-1.5 1.5" stroke="var(--crm-blue)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.5 8.5L1 10l1.5 1.5" stroke="var(--crm-blue)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--crm-fg1)' }}>Player Lifecycle Report</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginTop: 3 }}>
              Player health stages, lifecycle transitions, and CRM intervention impact
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} style={selectStyle}>
                {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <button
              onClick={() => data && exportCsv(data.stages)}
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
              onClick={() => data && exportCsv(data.stages)}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--crm-border)', background: 'var(--crm-white)', color: 'var(--crm-fg2)', fontSize: 12, cursor: 'pointer' }}
            >
              ↓ CSV
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {TH('stage',           'Stage'             )}
                  {TH('players',         'Players'           )}
                  {TH('pct_of_total',    '% of Total'        )}
                  {TH('avg_deposits_30d','Avg Deposits (30d)' )}
                  <th style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-bg)' }}>
                    Days Since Active
                  </th>
                  {TH('crm_touchpoints', 'CRM Touchpoints'   )}
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 14px', borderBottom: '1px solid var(--crm-border)' }}>
                        <div style={{ height: 12, background: 'var(--g100)', borderRadius: 3, width: j === 0 ? '70%' : '45%' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && sortedStages.map((row, i) => (
                  <tr key={row.stage} style={{ background: i % 2 === 0 ? 'var(--crm-white)' : 'transparent' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--crm-fg1)', borderBottom: '1px solid var(--crm-border)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: stageColor(row.stage), flexShrink: 0 }} />
                        {row.stage}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>{fmt(row.players)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>{fmtPct(row.pct_of_total)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>
                      {row.avg_deposits_30d != null ? fmtCurrency(row.avg_deposits_30d) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg3)', borderBottom: '1px solid var(--crm-border)' }}>{row.days_since_active}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--crm-fg2)', borderBottom: '1px solid var(--crm-border)' }}>
                      {row.crm_touchpoints != null ? row.crm_touchpoints.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
                {!loading && sortedStages.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--crm-fg4)' }}>
                      No lifecycle data found for the selected window
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!loading && sortedStages.length > 0 && (
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--crm-border)', fontSize: 12, color: 'var(--crm-fg3)' }}>
              Showing {sortedStages.length} row{sortedStages.length !== 1 ? 's' : ''} —{' '}
              <span style={{ color: 'var(--crm-blue)', cursor: 'pointer' }} onClick={() => data && exportCsv(data.stages)}>Export full dataset</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
