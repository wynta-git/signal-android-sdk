'use client';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { fetchReports, createReport } from '../../store/slices/reportsSlice';
import type { ReportFilters } from '../../services/reportsApi';
import CustomReportBuilder  from './CustomReportBuilder';
import CustomReportView     from './CustomReportView';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

type View = 'list' | 'create' | { type: 'report'; id: string };

export default function ReportsPage() {
  const dispatch  = useDispatch<AppDispatch>();
  const reports   = useSelector((s: RootState) => s.reports.reports);
  const listStatus   = useSelector((s: RootState) => s.reports.status.list);
  const creating  = useSelector((s: RootState) => s.reports.status.creating === 'loading');
  const [view,        setView]       = useState<View>('list');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchReports(PROJECT_ID));
  }, [dispatch]);

  async function handleSave(name: string, metrics: string[], filters: ReportFilters) {
    setCreateError(null);
    const result = await dispatch(createReport({ payload: { name, metrics, filters }, projectId: PROJECT_ID }));
    if (createReport.fulfilled.match(result)) {
      await dispatch(fetchReports(PROJECT_ID));
      setView('list');
    } else {
      setCreateError('Failed to create report. Please try again.');
    }
  }

  if (view === 'create') {
    return (
      <CustomReportBuilder
        onSave={handleSave}
        onCancel={() => { setCreateError(null); setView('list'); }}
        saving={creating}
        error={createError}
      />
    );
  }

  if (typeof view === 'object' && view.type === 'report') {
    return (
      <CustomReportView
        reportId={view.id}
        onBack={() => setView('list')}
        onCreateNew={() => setView('create')}
      />
    );
  }

  // ── List view: custom reports ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '18px 28px 14px', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-white)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--crm-fg1)' }}>Custom Reports</div>
          <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginTop: 3 }}>Custom reports scoped to your account</div>
        </div>
        <button
          onClick={() => setView('create')}
          style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--crm-blue)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          + Custom Report
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {listStatus === 'loading' && (
          <div style={{ color: 'var(--crm-fg4)', fontSize: 13, textAlign: 'center', padding: 32 }}>Loading…</div>
        )}

        {listStatus === 'succeeded' && reports.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--crm-fg2)', marginBottom: 8 }}>No custom reports yet</div>
            <div style={{ fontSize: 13, color: 'var(--crm-fg4)', marginBottom: 20 }}>Create a report to track the metrics that matter to you</div>
            <button
              onClick={() => setView('create')}
              style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: 'var(--crm-blue)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              + Create Custom Report
            </button>
          </div>
        )}

        {reports.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-fg2)', marginBottom: 14 }}>
              My Reports ({reports.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {reports.map(r => (
                <div
                  key={r.report_id}
                  onClick={() => setView({ type: 'report', id: r.report_id })}
                  style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, padding: '18px 20px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shm)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-fg1)', marginBottom: 6 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-fg3)', marginBottom: 12 }}>
                    {r.metrics.length} metric{r.metrics.length !== 1 ? 's' : ''} · {r.filters.date_range.replace(/_/g, ' ')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {r.metrics.slice(0, 4).map(k => (
                      <span key={k} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: 'var(--crm-bg)', border: '1px solid var(--crm-border)', color: 'var(--crm-fg3)' }}>
                        {k.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {r.metrics.length > 4 && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: 'var(--crm-bg)', border: '1px solid var(--crm-border)', color: 'var(--crm-fg3)' }}>
                        +{r.metrics.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
