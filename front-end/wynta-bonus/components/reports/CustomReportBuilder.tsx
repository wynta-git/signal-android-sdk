'use client';
import { useState } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import { api } from '../../services/api';
import { downloadCsv, rowsToCsv } from '../../services/csv';
import type { CustomReportResponse, ReportDateRange } from '../../types';
import { trackedCell } from './trackedValue';

const DIMENSIONS = [
  { id: 'bonus', label: 'Bonus', icon: 'gift' },
  { id: 'subhead', label: 'Subhead', icon: 'layers' },
  { id: 'programme', label: 'Bonus programme', icon: 'folder' },
  { id: 'player', label: 'Player', icon: 'user' },
];

const METRICS: { id: string; label: string; tracked: boolean }[] = [
  { id: 'redemptions', label: 'Redemptions', tracked: true },
  { id: 'unique_players', label: 'Unique players', tracked: true },
  { id: 'avg_payout', label: 'Avg payout', tracked: true },
  { id: 'total_bonus_cost', label: 'Total bonus cost', tracked: true },
  { id: 'avg_cost_per_redemption', label: 'Avg cost / redemption', tracked: true },
  { id: 'ggr', label: 'GGR', tracked: false },
  { id: 'budget_used', label: 'Budget used', tracked: true },
  { id: 'budget_utilisation_pct', label: 'Budget utilisation %', tracked: true },
  { id: 'wagering_completion_pct', label: 'Wagering completion %', tracked: true },
  { id: 'redemption_rate_pct', label: 'Redemption rate %', tracked: false },
];

const METRIC_LABELS: Record<string, string> = Object.fromEntries(METRICS.map((m) => [m.id, m.label]));

const DEFAULT_METRICS = new Set(['redemptions', 'unique_players', 'avg_payout', 'total_bonus_cost']);

function defaultRange(): ReportDateRange {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(yearStart), endDate: iso(now) };
}

const INTEGER_METRICS = new Set(['redemptions', 'unique_players']);

function formatMetricValue(key: string, v: number): string {
  return INTEGER_METRICS.has(key) ? String(v) : v.toFixed(2);
}

interface Props {
  brandId?: number;
}

export default function CustomReportBuilder({ brandId }: Props) {
  const [dimension, setDimension] = useState('player');
  const [metrics, setMetrics] = useState<Set<string>>(new Set(DEFAULT_METRICS));
  const [status, setStatus] = useState('all');
  const [range] = useState<ReportDateRange>(defaultRange);
  const [hasRun, setHasRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CustomReportResponse | null>(null);

  function toggleMetric(id: string, trackedFlag: boolean) {
    if (!trackedFlag) return;
    setMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleRun() {
    if (!brandId || metrics.size === 0) return;
    setHasRun(true);
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchCustomReport(brandId, dimension, Array.from(metrics), status, range, 50, 0);
      setResult(data);
    } catch (e) {
      console.error(e);
      setError('Failed to run report. Please try again.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    if (!result) return;
    const rows = result.rows.map((r) => {
      const row: Record<string, unknown> = { dimension_label: r.dimension_label };
      for (const col of result.columns) row[col] = trackedCell(r.values[col], (n) => formatMetricValue(col, n));
      return row;
    });
    const csv = rowsToCsv(rows, [
      { key: 'dimension_label', label: 'Dimension' },
      ...result.columns.map((c) => ({ key: c, label: METRIC_LABELS[c] ?? c })),
    ]);
    downloadCsv('custom-report.csv', csv);
  }

  return (
    <div className="dq-dashboard">
      <div className="dq-header">
        <div>
          <h1 className="dq-title">Custom Report</h1>
          <div className="dq-title-desc">Build and save a report across any dimension and metric set</div>
        </div>
        <div className="dq-report-controls">
          <button type="button" className="dq-export-btn" onClick={handleExport} disabled={!result || result.rows.length === 0}>
            <Icon name="download" size={14} strokeWidth={2} />
            Export CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
        <div className="dq-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="dq-stat-label" style={{ marginBottom: 8 }}>DIMENSION</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {DIMENSIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDimension(d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 6, textAlign: 'left',
                    border: dimension === d.id ? '1px solid var(--blue)' : '1px solid transparent',
                    background: dimension === d.id ? 'var(--bp)' : 'transparent',
                    color: dimension === d.id ? 'var(--blue)' : 'var(--g700)',
                    fontSize: 13, fontWeight: dimension === d.id ? 600 : 400, cursor: 'pointer',
                  }}
                >
                  <Icon name={d.icon} size={14} strokeWidth={2} />
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="dq-stat-label" style={{ marginBottom: 8 }}>METRICS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {METRICS.map((m) => (
                <label
                  key={m.id}
                  title={m.tracked ? undefined : 'Not tracked yet'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                    color: m.tracked ? 'var(--g700)' : 'var(--g400)',
                    cursor: m.tracked ? 'pointer' : 'not-allowed',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={metrics.has(m.id)}
                    disabled={!m.tracked}
                    onChange={() => toggleMetric(m.id, m.tracked)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="dq-stat-label" style={{ marginBottom: 8 }}>FILTERS</div>
            <label style={{ fontSize: 12.5, color: 'var(--g500)' }}>
              Status {dimension !== 'bonus' && <span style={{ color: 'var(--g400)' }}>(bonus dimension only)</span>}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={dimension !== 'bonus'}
                className="dq-report-date-input"
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="paused">Paused</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={metrics.size === 0 || loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              height: 36, border: 'none', borderRadius: 6, background: 'var(--blue)',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              opacity: metrics.size === 0 || loading ? 0.5 : 1,
            }}
          >
            <Icon name="play" size={14} strokeWidth={2} />
            {loading ? 'Running…' : 'Run report'}
          </button>
        </div>

        {!hasRun ? (
          <div className="dq-card" style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: 'var(--g400)' }}>
              <Icon name="bar-chart-2" size={28} strokeWidth={1.5} />
              <div style={{ fontSize: 13, marginTop: 10 }}>
                Configure your report on the left<br />and click <strong>Run report</strong>.
              </div>
            </div>
          </div>
        ) : (
          <div className="dq-card">
            <table className="dq-table">
              <thead>
                <tr>
                  <th>{DIMENSIONS.find((d) => d.id === dimension)?.label ?? 'Dimension'}</th>
                  {(result?.columns ?? Array.from(metrics)).map((c) => (
                    <th key={c}>{METRIC_LABELS[c] ?? c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={metrics.size + 1}><div className="dq-skeleton-line" style={{ height: 16 }} /></td></tr>
                  ))}
                {!loading && error && (
                  <tr><td colSpan={metrics.size + 1} className="dq-empty-cell">{error}</td></tr>
                )}
                {!loading && !error && result && result.rows.length === 0 && (
                  <tr><td colSpan={metrics.size + 1} className="dq-empty-cell">No data for this report</td></tr>
                )}
                {!loading && !error && result?.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="dq-table-name">{r.dimension_label}</td>
                    {result.columns.map((c) => (
                      <td key={c}>{trackedCell(r.values[c], (n) => formatMetricValue(c, n))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
