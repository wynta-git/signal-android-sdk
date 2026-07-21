'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { downloadCsv, rowsToCsv } from '../../services/csv';
import { formatINR, formatINRCompact } from '../../services/mocks/utils';
import type { BudgetSpendResponse, ReportDateRange } from '../../types';
import ReportPageHeader from './ReportPageHeader';
import ReportKpiRow from './ReportKpiRow';
import { trackedCell } from './trackedValue';

function defaultRange(): ReportDateRange {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(yearStart), endDate: iso(now) };
}

function utilBarClass(pct: number | null): string {
  if (pct === null) return 'ok';
  if (pct >= 90) return 'critical';
  if (pct >= 70) return 'warn';
  return 'ok';
}

interface Props {
  brandId?: number;
}

export default function BudgetSpendReport({ brandId }: Props) {
  const [range, setRange] = useState<ReportDateRange>(defaultRange);
  const [data, setData] = useState<BudgetSpendResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const result = await api.fetchBudgetSpendReport(brandId, range, 50, 0);
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
      data.rows.map((r) => ({ ...r, ggr: trackedCell(r.ggr, (n) => formatINR(n)) })),
      [
        { key: 'name', label: 'Subhead' },
        { key: 'programme', label: 'Programme' },
        { key: 'bonuses', label: 'Bonuses' },
        { key: 'budget_limit', label: 'Budget Limit' },
        { key: 'used', label: 'Used' },
        { key: 'utilisation_pct', label: 'Utilisation %' },
        { key: 'bonus_cost', label: 'Bonus Cost' },
        { key: 'ggr', label: 'GGR' },
        { key: 'avg_cost_per_redeem', label: 'Avg Cost / Redeem' },
      ],
    );
    downloadCsv('budget-spend.csv', csv);
  }

  return (
    <div className="dq-dashboard">
      <ReportPageHeader
        title="Budget & Spend"
        description="Budget utilisation, bonus cost by subhead and programme"
        range={range}
        onRangeChange={setRange}
        onExport={handleExport}
        exportDisabled={!data || data.rows.length === 0}
      />

      <ReportKpiRow
        loading={loading}
        items={[
          { label: 'Total bonus cost · 7d', value: formatINRCompact(data?.total_bonus_cost ?? 0), sub: '— not tracked (GGR)' },
          { label: 'Avg cost / redemption', value: formatINR(data?.avg_cost_per_redemption ?? 0), sub: '— across all bonuses' },
          { label: 'Budget utilisation', value: `${(data?.budget_utilisation_pct ?? 0).toFixed(2)}%`, sub: '— of monthly budget' },
        ]}
      />

      <div className="dq-card">
        <table className="dq-table">
          <thead>
            <tr>
              <th>Subhead</th>
              <th>Programme</th>
              <th>Bonuses</th>
              <th>Budget Limit</th>
              <th>Used</th>
              <th>Utilisation</th>
              <th>Bonus Cost · 7d</th>
              <th>GGR</th>
              <th>Avg Cost / Redeem</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={9}><div className="dq-skeleton-line" style={{ height: 16 }} /></td></tr>
              ))}
            {!loading && (!data || data.rows.length === 0) && (
              <tr><td colSpan={9} className="dq-empty-cell">No budget data for the selected range</td></tr>
            )}
            {!loading && data?.rows.map((r) => (
              <tr key={r.subhead_id}>
                <td>
                  <div className="dq-table-name">{r.name}</div>
                  {r.description && <div className="dq-table-subtitle">{r.description}</div>}
                </td>
                <td>{r.programme}</td>
                <td>{r.bonuses}</td>
                <td>{r.budget_limit !== null ? formatINRCompact(r.budget_limit) : '—'}</td>
                <td>{formatINRCompact(r.used)}</td>
                <td>
                  {r.utilisation_pct !== null ? (
                    <div className="dq-budget-bar-group" style={{ minWidth: 90 }}>
                      <div className="dq-budget-bar">
                        <div className={utilBarClass(r.utilisation_pct)} style={{ width: Math.min(100, r.utilisation_pct) + '%' }} />
                      </div>
                      <div className="dq-budget-bar-amounts">{r.utilisation_pct.toFixed(2)}%</div>
                    </div>
                  ) : '—'}
                </td>
                <td>{formatINRCompact(r.bonus_cost)}</td>
                <td>{trackedCell(r.ggr, (n) => formatINR(n))}</td>
                <td>{formatINR(r.avg_cost_per_redeem)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
