'use client';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { fetchReport, deleteReport, clearActiveReport } from '../../store/slices/reportsSlice';
import { ALL_METRICS, DATE_RANGE_LABELS } from './CustomReportBuilder';
import type { MetricValue, DateRange } from '../../services/reportsApi';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

const METRIC_LABEL: Record<string, string> = Object.fromEntries(
  ALL_METRICS.map(m => [m.key, m.label])
);

function fmtValue(key: string, mv: MetricValue | undefined): string {
  if (!mv || mv.value === null || mv.value === undefined) return '—';
  const v = mv.value;
  if (key.endsWith('_rate') || key === 'ctr' || key === 'open_rate' || key === 'player_health_score') {
    return (v * (v <= 1 ? 100 : 1)).toFixed(1) + '%';
  }
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'k';
  return v.toLocaleString();
}

function ChangePct({ value }: { value?: number | null }) {
  if (value == null) return null;
  const positive = value >= 0;
  return (
    <span style={{ fontSize: 11, color: positive ? 'var(--crm-positive)' : 'var(--crm-negative)' }}>
      {positive ? '↑' : '↓'} {Math.abs(value)}%
    </span>
  );
}

interface Props {
  reportId: string;
  onBack: () => void;
  onCreateNew: () => void;
  onDeleted?: () => void;
}

export default function CustomReportView({ reportId, onBack, onCreateNew, onDeleted }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const report   = useSelector((s: RootState) => s.reports.activeReport);
  const status   = useSelector((s: RootState) => s.reports.status.active);

  useEffect(() => {
    dispatch(fetchReport({ reportId, projectId: PROJECT_ID }));
    return () => { dispatch(clearActiveReport()); };
  }, [dispatch, reportId]);

  async function handleDelete() {
    if (!report) return;
    if (!confirm(`Delete "${report.name}"?`)) return;
    await dispatch(deleteReport({ reportId: report.report_id, projectId: PROJECT_ID }));
    onDeleted?.();
    onBack();
  }

  if (status === 'loading' || !report) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--crm-fg4)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  const data = report.data ?? {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '18px 28px 14px', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-fg3)', fontSize: 13, padding: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
            ‹ Reports
          </button>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--crm-fg1)' }}>{report.name}</div>
          <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginTop: 2 }}>
            {report.metrics.map(k => METRIC_LABEL[k] ?? k).join(', ').substring(0, 60)}
            {report.metrics.length > 3 ? '…' : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginTop: 4 }}>
            {DATE_RANGE_LABELS[report.filters.date_range as DateRange] ?? report.filters.date_range.replace(/_/g, ' ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleDelete}
            style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--crm-negative)', background: 'transparent', color: 'var(--crm-negative)', fontSize: 13, cursor: 'pointer' }}
          >
            Delete Report
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(report.metrics.length, 4)}, 1fr)`, gap: 16, marginBottom: 24 }}>
          {report.metrics.map(key => {
            const mv = data[key];
            return (
              <div key={key} style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginBottom: 6 }}>{METRIC_LABEL[key] ?? key}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--crm-fg1)', marginBottom: 4 }}>
                  {fmtValue(key, mv)}
                </div>
                {mv?.tracked === false ? (
                  <span style={{ fontSize: 11, color: 'var(--crm-positive)' }}>Pending data</span>
                ) : (
                  <ChangePct value={mv?.change_pct} />
                )}
              </div>
            );
          })}
        </div>

        {/* Data table */}
        <div style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--crm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-fg1)' }}>Data Table</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-bg)' }}>
                {['Metric', 'Value', 'Change', 'Channel', 'Segment'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.metrics.map((key, i) => {
                const mv = data[key];
                return (
                  <tr key={key} style={{ borderBottom: i < report.metrics.length - 1 ? '1px solid var(--crm-border)' : 'none' }}>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--crm-fg1)', fontWeight: 500 }}>{METRIC_LABEL[key] ?? key}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--crm-fg2)' }}>{fmtValue(key, mv)}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13 }}>
                      {mv?.change_pct != null ? <ChangePct value={mv.change_pct} /> : '—'}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--crm-fg2)', textTransform: 'capitalize' }}>
                      {report.filters.channel === 'all' ? 'All' : report.filters.channel}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--crm-fg2)' }}>
                      {report.filters.segment_id ?? 'All Segments'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--crm-border)', fontSize: 12, color: 'var(--crm-fg3)' }}>
            Showing {report.metrics.length} metric{report.metrics.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
