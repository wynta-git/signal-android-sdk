'use client';
import { useCallback, useEffect, useState } from 'react';
import Badge from 'wynta-react-common/components/Badge';
import { api } from '../../services/api';
import { downloadCsv, rowsToCsv } from '../../services/csv';
import { formatINR } from '../../services/mocks/utils';
import type { BonusPerformanceResponse, ReportDateRange } from '../../types';
import ReportPageHeader from './ReportPageHeader';
import ReportKpiRow from './ReportKpiRow';
import { trackedCell } from './trackedValue';

function defaultRange(): ReportDateRange {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(yearStart), endDate: iso(now) };
}

function statusBadgeKind(status: string): string {
  if (status === 'Expired') return 'expired';
  if (status === 'Paused') return 'paused';
  return 'active';
}

interface Props {
  brandId?: number;
}

export default function BonusPerformanceReport({ brandId }: Props) {
  const [range, setRange] = useState<ReportDateRange>(defaultRange);
  const [data, setData] = useState<BonusPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const result = await api.fetchBonusPerformanceReport(brandId, range, 50, 0);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [brandId, range.startDate, range.endDate]);

  useEffect(() => {
    load();
  }, [load]);

  function handleExport() {
    if (!data) return;
    const csv = rowsToCsv(
      data.rows.map((r) => ({
        ...r,
        redeem_rate: trackedCell(r.redeem_rate, (n) => `${n.toFixed(2)}%`),
      })),
      [
        { key: 'name', label: 'Bonus' },
        { key: 'programme', label: 'Programme' },
        { key: 'type', label: 'Type' },
        { key: 'redemptions', label: 'Redemptions' },
        { key: 'players', label: 'Players' },
        { key: 'avg_payout', label: 'Avg Payout' },
        { key: 'redeem_rate', label: 'Redeem Rate' },
        { key: 'status', label: 'Status' },
      ],
    );
    downloadCsv('bonus-performance.csv', csv);
  }

  return (
    <div className="dq-dashboard">
      <ReportPageHeader
        title="Bonus Performance"
        description="Redemption and payout metrics across all bonus configurations"
        range={range}
        onRangeChange={setRange}
        onExport={handleExport}
        exportDisabled={!data || data.rows.length === 0}
      />

      <ReportKpiRow
        loading={loading}
        items={[
          { label: 'Redemptions · 7d', value: data?.redemptions ?? 0, sub: '— all bonuses' },
          { label: 'Unique players', value: data?.unique_players ?? 0, sub: '— across all bonuses' },
          { label: 'Avg payout', value: formatINR(data?.avg_payout ?? 0), sub: '— per player' },
          {
            label: 'GGR vs Cost',
            value: data ? trackedCell(data.ggr_vs_cost, (n) => `${n}%`) : '—',
            sub: '— not tracked yet',
          },
        ]}
      />

      <div className="dq-card">
        <table className="dq-table">
          <thead>
            <tr>
              <th>Bonus</th>
              <th>Programme</th>
              <th>Type</th>
              <th>Redemptions · 7d</th>
              <th>Players</th>
              <th>Avg Payout</th>
              <th>Redeem Rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={8}><div className="dq-skeleton-line" style={{ height: 16 }} /></td></tr>
              ))}
            {!loading && (!data || data.rows.length === 0) && (
              <tr><td colSpan={8} className="dq-empty-cell">No bonus data for the selected range</td></tr>
            )}
            {!loading && data?.rows.map((r) => (
              <tr key={r.configure_id}>
                <td className="dq-table-name">{r.name}</td>
                <td>{r.programme}</td>
                <td><Badge kind="priority">{r.type}</Badge></td>
                <td>{r.redemptions}</td>
                <td>{r.players}</td>
                <td>{formatINR(r.avg_payout)}</td>
                <td>{trackedCell(r.redeem_rate, (n) => `${n.toFixed(2)}%`)}</td>
                <td><Badge kind={statusBadgeKind(r.status)}>{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
