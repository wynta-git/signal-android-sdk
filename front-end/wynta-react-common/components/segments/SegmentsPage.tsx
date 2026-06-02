'use client';
import { useState, useMemo, useEffect } from 'react';
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
import { formatConditions } from '../../utils';
import type { Segment } from '../../types';

/* ------------------------------------------------------------------ */
/* Static sample rows shown when backend returns no data               */
/* ------------------------------------------------------------------ */
const SAMPLE_SEGMENTS: SegmentRow[] = [
  {
    id: 's1', name: 'VIP Players', type: 'static',
    conditions: 'Loyalty Tier = Gold or Platinum',
    reach: '1,240 players', created: '12 Jan 2026', createdBy: 'Funessa B.',
    usedIn: ['Weekend Cashback', 'VIP Email'],
  },
  {
    id: 's2', name: 'Inactive 7 Days', type: 'static',
    conditions: 'Days Since Last Login > 7',
    reach: '3,180 players', created: '10 Jan 2026', createdBy: 'Funessa B.',
    usedIn: ['Re-engagement Push', 'Deposit Reminder SMS'],
  },
  {
    id: 's3', name: 'Slot Players', type: 'static',
    conditions: 'Preferred Game Category = Slots',
    reach: '2,890 players', created: '08 Jan 2026', createdBy: 'Funessa B.',
    usedIn: ['New Game Launch'],
  },
  {
    id: 's4', name: 'Bonus Expiry Risk', type: 'static',
    conditions: 'Bonus Expiry (hours) < 48 AND Bonus Active = Yes',
    reach: '412 players', created: '15 Jan 2026', createdBy: 'Funessa B.',
    usedIn: ['Bonus Expiry Push', 'Expiry Alert SMS'],
  },
  {
    id: 's5', name: 'All Opted-in Players', type: 'static',
    conditions: 'Push Opted-in = Yes',
    reach: '8,241 players', created: '01 Jan 2026', createdBy: 'System',
    usedIn: ['3 campaigns'],
  },
  {
    id: 's6', name: 'Registered Yesterday & Deposited Today', type: 'dynamic',
    conditions: 'Registration Date = yesterday AND First Deposit Date = today',
    reach: '~28 players/day', created: '20 Jan 2026', createdBy: 'Funessa B.',
    usedIn: ['FTD Welcome Push'],
  },
  {
    id: 's7', name: 'Birthday This Week', type: 'dynamic',
    conditions: 'Birthday (upcoming) within 7 days',
    reach: '~84 players/week', created: '05 Jan 2026', createdBy: 'Funessa B.',
    usedIn: ['Birthday Push'],
  },
  {
    id: 's8', name: 'High Deposit Value', type: 'static',
    conditions: 'Lifetime Deposits > ₹50,000',
    reach: '5,620 players', created: '03 Jan 2026', createdBy: 'Funessa B.',
    usedIn: [],
  },
  {
    id: 's9', name: 'Lapsed 30 Days', type: 'dynamic',
    conditions: 'Last Login > 30 days AND Was Active last month',
    reach: '~190 players/week', created: '28 Dec 2025', createdBy: 'System',
    usedIn: ['Win-back Flow'],
  },
  {
    id: 's10', name: 'New Depositors (FTD)', type: 'dynamic',
    conditions: 'First Deposit Date = today',
    reach: '~35 players/day', created: '01 Jan 2026', createdBy: 'System',
    usedIn: ['Welcome Journey'],
  },
  {
    id: 's11', name: 'At-Risk Players', type: 'static',
    conditions: 'Health Score < 40 AND Active last 30 days',
    reach: '1,840 players', created: '12 Dec 2025', createdBy: 'Funessa B.',
    usedIn: [],
  },
  {
    id: 's12', name: 'Weekend Warriors', type: 'dynamic',
    conditions: 'Sessions on Sat/Sun > 3 (last 4 weeks)',
    reach: '~920 players/week', created: '20 Dec 2025', createdBy: 'Funessa B.',
    usedIn: [],
  },
];

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
    created:   (s as any).created_at
               ? new Date((s as any).created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
               : '—',
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

  useEffect(() => {
    if (status === 'idle') dispatch(fetchSegments());
  }, [dispatch, status]);

  const rows: SegmentRow[] = useMemo(() => {
    if (apiSegments.length > 0) return apiSegments.map(toRow);
    return SAMPLE_SEGMENTS;
  }, [apiSegments]);

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
          <button className="seg-btn-secondary" type="button">
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
            <select
              className="seg-type-select"
              value={typeFilter}
              onChange={e => setType(e.target.value as 'all' | 'static' | 'dynamic')}
            >
              <option value="all">All types</option>
              <option value="static">Static</option>
              <option value="dynamic">Dynamic</option>
            </select>
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
              {filtered.length === 0 ? (
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
