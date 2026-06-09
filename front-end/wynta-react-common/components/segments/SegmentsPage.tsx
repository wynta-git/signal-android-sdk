'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import { useCommonSelector } from '../../store/hooks';
import {
  fetchSegments,
  selectAllSegments,
  selectSegmentsStatus,
  selectAllEvaluating,
  deleteSegment,
} from '../../store/slices/segmentsSlice';
import AddSegmentModal     from './AddSegmentModal';
import DeleteSegmentModal  from './DeleteSegmentModal';
import { formatConditions, formatRelative } from '../../utils';
import type { Segment } from '../../types';


interface SegmentRow {
  id: string;
  name: string;
  type: 'static' | 'dynamic';
  conditions: string;
  reach: string;
  created: string;
  createdBy: string;
  usedIn: string[];
}

function toRow(s: Segment): SegmentRow {
  const name  = s.label ?? s.name ?? String(s.id);
  const isDyn = (s as any).segment_type === 'dynamic' || (s as any).type === 'dynamic';
  return {
    id:        String(s.id),
    name,
    type:      isDyn ? 'dynamic' : 'static',
    conditions: formatConditions(s.rule) || (s as any).description || (s.hint ?? ''),
    reach:     s.count ? s.count.toLocaleString('en-IN') + ' players' : '—',
    created:   formatRelative(s.last_used_at),
    createdBy: (s as any).owner ?? s.owner ?? 'System',
    usedIn:    (s as any).used_in ?? [],
  };
}

interface SegmentsPageProps {
  /** Called when user clicks Add Segment; if omitted the built-in modal is shown */
  onAddSegment?: () => void;
}

export default function SegmentsPage({ onAddSegment }: SegmentsPageProps) {
  const dispatch = useDispatch<any>();

  const apiSegments = useCommonSelector(selectAllSegments);
  const status      = useCommonSelector(selectSegmentsStatus);
  const didFetch    = useRef(false);

  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    dispatch(fetchSegments());
  }, [dispatch]);

  /* Use only real API data — no sample / fallback rows */
  /* Sort by last_refresh_time desc (maps to last_used_at in Segment type) */
  const rows: SegmentRow[] = useMemo(
    () => [...apiSegments]
      .sort((a, b) => {
        const tA = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const tB = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        return tB - tA;
      })
      .map(toRow),
    [apiSegments],
  );

  /* Evaluating state: id → boolean (for reach column spinner) */
  const evaluating = useCommonSelector(selectAllEvaluating);

  const [search, setSearch]   = useState('');
  const [typeFilter, setType] = useState<'all' | 'static' | 'dynamic'>('all');

  type ModalConfig = { mode: 'create' | 'edit'; segmentId?: string } | null;
  const [modalConfig, setModalConfig] = useState<ModalConfig>(null);

  const handleAddSegment = () => {
    if (onAddSegment) onAddSegment();
    else setModalConfig({ mode: 'create' });
  };

  function handleEdit(rowId: string) {
    setModalConfig({ mode: 'edit', segmentId: rowId });
  }

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
      const matchType   = typeFilter === 'all' || r.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [rows, search, typeFilter]);

  /* ── Export current filtered rows as CSV ── */
  function handleExport() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ['Segment Name', 'Conditions', 'Est. Reach', 'Created', 'Created By', 'Used In'];
    const csvRows = [
      headers.join(','),
      ...filtered.map(r => [
        esc(r.name),
        esc(r.conditions),
        esc(r.reach),
        esc(r.created),
        esc(r.createdBy),
        esc(r.usedIn.join('; ')),
      ].join(',')),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'segments.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalCount      = rows.length;
  const activeCampaigns = rows.reduce((n, r) => {
    if (r.usedIn.length === 0) return n;
    const numericEntry = r.usedIn.find(u => /^\d+/.test(u));
    if (numericEntry) return n + parseInt(numericEntry, 10);
    return n + r.usedIn.length;
  }, 0);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function handleDeleteClick(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    dispatch(deleteSegment(deleteTarget.id));
  }

  return (
    <div className="seg-page">
      {/* ── Page header ── */}
      <div className="seg-page-header">
        <div>
          <div className="seg-page-title">Segments</div>
          <div className="seg-page-subtitle">
            All player segments — reusable across Push, In-App, Email, SMS and WhatsApp
          </div>
        </div>
        <div className="seg-page-actions">
          <button className="seg-btn-secondary" type="button" onClick={handleExport}>
            <Icon name="download" size={14} />
            Export
          </button>
          <button
            className="seg-btn-primary"
            type="button"
            onClick={handleAddSegment}
          >
            <Icon name="plus" size={14} />
            Add Segment
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="seg-stats-row">
        <div className="seg-stat-card">
          <div className="seg-stat-label">Total Segments</div>
          <div className="seg-stat-value">{totalCount}</div>
          <div className="seg-stat-sub">across all types</div>
        </div>
        <div className="seg-stat-card">
          <div className="seg-stat-label">Active Campaigns Using</div>
          <div className="seg-stat-value">{activeCampaigns}</div>
          <div className="seg-stat-sub">segments in use</div>
        </div>
        <div className="seg-stat-card">
          <div className="seg-stat-label">Estimated Reach</div>
          <div className="seg-stat-value">0</div>
          <div className="seg-stat-sub">estimated users</div>
        </div>
      </div>

      {/* ── Table section ── */}
      <div className="seg-table-section">
        <div className="seg-table-toolbar">
          <div className="seg-table-toolbar-title">All Segments</div>
          <div className="seg-table-controls">
            <div className="seg-search-wrap">
              <span className="seg-search-icon">
                <Icon name="search" size={14} />
              </span>
              <input
                type="text"
                placeholder="Search segments..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="seg-table-scroll">
          <table className="seg-list-table">
            <thead>
              <tr>
                <th>Segment Name</th>
                <th>Conditions</th>
                <th>Est. Reach</th>
                <th>Created</th>
                <th>Created By</th>
                <th>Used In</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {status === 'loading' ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--crm-fg4)' }}>
                    Loading segments…
                  </td>
                </tr>
              ) : status === 'failed' ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--crm-negative, #D64545)' }}>
                    Unable to load segments. Check your connection and try again.
                  </td>
                </tr>
              ) : filtered.length === 0 && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--crm-fg4)' }}>
                    No segments found. Click <strong>+ Add Segment</strong> to create one.
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--crm-fg4)' }}>
                    No segments match your search.
                  </td>
                </tr>
              ) : (
                filtered.map(row => (
                  <tr key={row.id}>
                    <td>
                      <div className="seg-row-name">{row.name}</div>
                    </td>
                    <td>
                      <div className="seg-conditions" title={row.conditions}>
                        {row.conditions || '—'}
                      </div>
                    </td>
                    <td>
                      {evaluating[row.id] ? (
                        <span className="seg-evaluating">
                          <Icon name="loader" size={12} />
                          Counting…
                        </span>
                      ) : (
                        <div className="seg-reach">{row.reach}</div>
                      )}
                    </td>
                    <td>
                      <div className="seg-date">{row.created}</div>
                    </td>
                    <td>
                      <div className="seg-creator">{row.createdBy}</div>
                    </td>
                    <td>
                      {row.usedIn.length > 0 ? (
                        <div className="seg-used-in">
                          {row.usedIn.map((u, i) => (
                            <span key={i} className="seg-campaign-pill">{u}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--crm-fg4)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="seg-row-actions">
                        <button
                          className="seg-row-btn"
                          type="button"
                          onClick={() => handleEdit(row.id)}
                        >
                          Edit
                        </button>
                        <button
                          className="seg-row-btn delete"
                          type="button"
                          onClick={() => handleDeleteClick(row.id, row.name)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteSegmentModal
          segmentName={deleteTarget.name}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Add / Edit Segment modal */}
      {modalConfig && (
        <AddSegmentModal
          mode={modalConfig.mode}
          segmentId={modalConfig.segmentId}
          onClose={() => setModalConfig(null)}
          onSaved={() => { setModalConfig(null); dispatch(fetchSegments()); }}
        />
      )}

    </div>
  );
}
