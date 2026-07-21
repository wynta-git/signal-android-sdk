'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { downloadCsv, rowsToCsv } from '../../services/csv';
import { formatINRCompact } from '../../services/mocks/utils';
import type { PlayerActivityResponse, ReportDateRange } from '../../types';
import ReportPageHeader from './ReportPageHeader';
import ReportKpiRow from './ReportKpiRow';

function defaultRange(): ReportDateRange {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(now), endDate: iso(now) };
}

const AVATAR_COLORS = ['#0ea5a4', '#3b82f6', '#a3b117', '#f59e0b', '#d946ef', '#6366f1', '#ef4444', '#10b981'];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function completionBarClass(pct: number): string {
  return pct >= 70 ? 'ok' : 'warn';
}

interface Props {
  brandId?: number;
}

export default function PlayerActivityReport({ brandId }: Props) {
  const [range, setRange] = useState<ReportDateRange>(defaultRange);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<PlayerActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const result = await api.fetchPlayerActivityReport(brandId, range, search || undefined, 50, 0);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [brandId, range.startDate, range.endDate, search]);

  useEffect(() => {
    const handle = setTimeout(load, 300);
    return () => clearTimeout(handle);
  }, [load]);

  function handleExport() {
    if (!data) return;
    const csv = rowsToCsv(data.rows, [
      { key: 'external_user_id', label: 'Player' },
      { key: 'bonuses_received', label: 'Bonuses Received' },
      { key: 'redeemed_count', label: 'Redeemed' },
      { key: 'total_value', label: 'Total Value' },
      { key: 'wagering_completion_pct', label: 'Wagering Completion %' },
    ]);
    downloadCsv('player-activity.csv', csv);
  }

  return (
    <div className="dq-dashboard">
      <ReportPageHeader
        title="Player Activity"
        description="Bonus uptake and wagering progress per player"
        range={range}
        onRangeChange={setRange}
        onExport={handleExport}
        exportDisabled={!data || data.rows.length === 0}
      />

      <ReportKpiRow
        loading={loading}
        items={[
          { label: 'Total players', value: data?.total_players ?? 0, sub: '— in sample' },
          { label: 'Total bonus value', value: formatINRCompact(data?.total_bonus_value ?? 0), sub: '— credited' },
          { label: 'Avg wagering', value: `${(data?.avg_wagering_pct ?? 0).toFixed(2)}%`, sub: '— completion' },
        ]}
      />

      <input
        type="text"
        className="dq-search-input"
        placeholder="Search by player ID or username…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="dq-card">
        <table className="dq-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Bonuses Received</th>
              <th>Total Value</th>
              <th>Wagering Completion</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={4}><div className="dq-skeleton-line" style={{ height: 16 }} /></td></tr>
              ))}
            {!loading && (!data || data.rows.length === 0) && (
              <tr><td colSpan={4} className="dq-empty-cell">No player activity for the selected range</td></tr>
            )}
            {!loading && data?.rows.map((r) => (
              <tr key={r.pam_user_id}>
                <td>
                  <div className="dq-table-name-row">
                    <span
                      style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: avatarColor(r.external_user_id), color: '#fff',
                        fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                      }}
                    >
                      {r.external_user_id.slice(0, 1)}
                    </span>
                    <div>
                      <div className="dq-table-name">{r.external_user_id}</div>
                      <div className="dq-table-subtitle">PLY-{String(r.pam_user_id).padStart(3, '0')}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {r.bonuses_received}
                  <div className="dq-table-subtitle">{r.redeemed_count} redeemed</div>
                </td>
                <td>{formatINRCompact(r.total_value)}</td>
                <td>
                  <div className="dq-budget-bar-group" style={{ minWidth: 90 }}>
                    <div className="dq-budget-bar">
                      <div className={completionBarClass(r.wagering_completion_pct)} style={{ width: Math.min(100, r.wagering_completion_pct) + '%' }} />
                    </div>
                    <div className="dq-budget-bar-amounts">{r.wagering_completion_pct.toFixed(2)}%</div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
