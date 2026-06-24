'use client';
import { useState, useMemo, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Icon from 'wynta-react-common/components/Icon';
import { useAppSelector } from '../../store/hooks';
import {
  fetchCampaigns,
  getCampaign,
  deleteCampaign,
  activateCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  selectAllCampaigns,
  selectCampaignsStatus,
} from '../../store/slices/campaignsSlice';
import type { Campaign, CampaignStatus } from '../../services/campaignApi';
import ChannelSelectModal from './ChannelSelectModal';
import CampaignWizard from './CampaignWizard';
import DeleteCampaignModal from './DeleteCampaignModal';


/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function channelLabel(ch: string) {
  const map: Record<string, string> = {
    push: 'Push', email: 'Email', sms: 'SMS',
    in_app: 'In-App', on_site: 'On-Site', cards: 'Cards',
    whatsapp: 'WhatsApp', telegram: 'Telegram', rcs: 'RCS',
  };
  return map[ch] ?? ch;
}

const STATUS_CFG: Record<CampaignStatus, { label: string; cls: string }> = {
  running:   { label: 'Running',   cls: 'cp-badge cp-badge--running'   },
  scheduled: { label: 'Scheduled', cls: 'cp-badge cp-badge--scheduled' },
  draft:     { label: 'Draft',     cls: 'cp-badge cp-badge--draft'     },
  paused:    { label: 'Paused',    cls: 'cp-badge cp-badge--paused'    },
  completed: { label: 'Completed', cls: 'cp-badge cp-badge--completed' },
  cancelled: { label: 'Cancelled', cls: 'cp-badge cp-badge--cancelled' },
};

function scheduleTypeLabel(c: Campaign): string {
  const sc = c.schedule;
  if (!sc) return '—';
  if (sc.schedule_type === 'one_time') {
    return sc.execution_type === 'specific_datetime' ? 'One Time' : 'Immediate';
  }
  if (sc.schedule_type === 'periodic') {
    const f = sc.frequency ?? (sc as any).periodic_type ?? '';
    return f ? f.charAt(0).toUpperCase() + f.slice(1) : 'Periodic';
  }
  return '—';
}

function formatActivity(dateStr?: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr; // pass through if already formatted

  const now     = new Date();
  const diffMs  = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1)   return 'just now';
  if (diffMin < 60)  return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)   return `${diffHr}h ago`;

  const todayStr     = now.toDateString();
  const yesterday    = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const dateStr2     = date.toDateString();

  if (dateStr2 === todayStr)     return 'Today';
  if (dateStr2 === yesterdayStr) return 'Yesterday';

  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffDay < 7)  return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;

  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatRevenue(n?: number) {
  if (!n) return '—';
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */
type CpSortCol = 'name' | 'objective' | 'segment' | 'channel' | 'schedule' | 'status' | 'revenue' | 'activity';

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  return (
    <svg width="10" height="12" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0, color: 'var(--crm-blue)' }}>
      <path d="M5 1L2 5h6L5 1z" fill="currentColor" opacity={dir === 'asc' ? 1 : 0.35} />
      <path d="M5 13L2 9h6l-3 4z" fill="currentColor" opacity={dir === 'desc' ? 1 : 0.35} />
    </svg>
  );
}

export default function CampaignsPage({ autoOpenAdd, brandId }: { autoOpenAdd?: boolean; brandId?: number }) {
  const dispatch     = useDispatch<any>();
  const apiCampaigns = useAppSelector(selectAllCampaigns);
  const status       = useAppSelector(selectCampaignsStatus);

  useEffect(() => {
    dispatch(fetchCampaigns({ brandId }));
  }, [dispatch, brandId]);

  const rows = apiCampaigns;

  /* Filters */
  const [search,    setSearch]    = useState('');
  const [objective, setObjective] = useState('');
  const [channel,   setChannel]   = useState('');
  const [sort,      setSort]      = useState<{ col: CpSortCol; dir: 'asc' | 'desc' } | null>(null);
  const [page,      setPage]      = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    const base = rows.filter(r => {
      if (search    && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (objective && r.objective !== objective) return false;
      if (channel   && r.channel   !== channel)   return false;
      return true;
    });
    return [...base].sort((a, b) => {
      if (sort) {
        const mul = sort.dir === 'asc' ? 1 : -1;
        let cmp = 0;
        switch (sort.col) {
          case 'name':     cmp = a.name.localeCompare(b.name); break;
          case 'objective': cmp = (a.objective ?? '').localeCompare(b.objective ?? ''); break;
          case 'segment':  cmp = (a.segment_name ?? '').localeCompare(b.segment_name ?? ''); break;
          case 'channel':  cmp = channelLabel(a.channel).localeCompare(channelLabel(b.channel)); break;
          case 'schedule': cmp = scheduleTypeLabel(a).localeCompare(scheduleTypeLabel(b)); break;
          case 'status':   cmp = a.status.localeCompare(b.status); break;
          case 'revenue':  cmp = (a.revenue_impact ?? 0) - (b.revenue_impact ?? 0); break;
          case 'activity': {
            const ta = a.last_activity ? new Date(a.last_activity).getTime() : 0;
            const tb = b.last_activity ? new Date(b.last_activity).getTime() : 0;
            cmp = ta - tb; break;
          }
        }
        if (cmp !== 0) return cmp * mul;
      }
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });
  }, [rows, search, objective, channel, sort]);

  useEffect(() => { setPage(1); }, [search, objective, channel, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function pageNumbers(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '…')[] = [1];
    if (page > 3) pages.push('…');
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) pages.push(p);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
    return pages;
  }

  const objectives = useMemo(() => [...new Set(rows.map(r => r.objective).filter(Boolean))], [rows]);
  const channels   = useMemo(() => [...new Set(rows.map(r => r.channel))], [rows]);

  /* Modals */
  const [showChannelModal, setShowChannelModal] = useState(false);
  useEffect(() => { if (autoOpenAdd) setShowChannelModal(true); }, [autoOpenAdd]);
  const [wizardChannel,    setWizardChannel]    = useState<string | null>(null);
  const [editCampaign,     setEditCampaign]     = useState<Campaign | null>(null);
  const [wizardViewMode,   setWizardViewMode]   = useState(false);
  const [deleteTarget,     setDeleteTarget]     = useState<Campaign | null>(null);
  const [loadingId,        setLoadingId]        = useState<string | null>(null);

  /* Action menu */
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  /** Fetch full campaign details then open the wizard in view or edit mode. */
  async function openWizard(c: Campaign, viewOnly: boolean) {
    setLoadingId(c.id);
    try {
      const full = await dispatch(getCampaign({ campaignId: c.id })).unwrap();
      setEditCampaign(full);
      setWizardViewMode(viewOnly);
    } catch {
      /* fallback: use list data */
      setEditCampaign(c);
      setWizardViewMode(viewOnly);
    } finally {
      setLoadingId(null);
    }
  }

  function handleAction(action: string, c: Campaign) {
    setOpenMenu(null);
    const ids = { campaignId: c.id };
    if (action === 'view')      { openWizard(c, true);  return; }
    if (action === 'edit')      { openWizard(c, false); return; }
    if (action === 'delete')    setDeleteTarget(c);
    if (action === 'activate')  dispatch(activateCampaign(ids));
    if (action === 'pause')     dispatch(pauseCampaign(ids));
    if (action === 'resume')    dispatch(resumeCampaign(ids));
    if (action === 'cancel')    dispatch(cancelCampaign(ids));
    if (action === 'duplicate') {
      /* Fetch full details so title/content/deep_link are available in the copy */
      setLoadingId(c.id);
      dispatch(getCampaign({ campaignId: c.id }))
        .unwrap()
        .then((full: Campaign) => {
          setEditCampaign({ ...full, id: '', name: `${full.name} (copy)`, status: 'draft' });
          setWizardViewMode(false);
        })
        .catch(() => {
          /* Fallback to list data if detail fetch fails */
          setEditCampaign({ ...c, id: '', name: `${c.name} (copy)`, status: 'draft' });
          setWizardViewMode(false);
        })
        .finally(() => setLoadingId(null));
    }
  }

  function closeWizard() {
    setWizardChannel(null);
    setEditCampaign(null);
    setWizardViewMode(false);
  }

  function handleExport() {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Campaign', 'Objective', 'Behavioral Segment', 'Channels', 'Schedule', 'Status', 'Revenue Impact', 'Last Activity'];
    const csvRows = [
      headers.join(','),
      ...filtered.map(c => [
        esc(c.name),
        esc(c.objective ?? ''),
        esc(c.segment_name ?? ''),
        esc(channelLabel(c.channel)),
        esc(scheduleTypeLabel(c)),
        esc(STATUS_CFG[c.status]?.label ?? c.status),
        esc(c.revenue_impact ? String(c.revenue_impact) : ''),
        esc(formatActivity(c.last_activity)),
      ].join(',')),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'campaigns.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Show wizard in-place (replaces list, sidebar stays visible) ── */
  if (wizardChannel || editCampaign) {
    return (
      <CampaignWizard
        /* key forces a full remount (fresh useState) when a different campaign opens */
        key={editCampaign?.id ?? 'new'}
        channel={wizardChannel ?? editCampaign!.channel}
        campaign={editCampaign ?? undefined}
        viewMode={wizardViewMode}
        onClose={closeWizard}
        onSaved={() => { closeWizard(); dispatch(fetchCampaigns({ brandId })); }}
        brandId={brandId}
      />
    );
  }

  return (
    <div className="cp-page">
      {/* ── Header ── */}
      <div className="cp-page-header">
        <div>
          <div className="cp-page-title">Campaigns</div>
          <div className="cp-page-subtitle">Unified omnichannel campaign orchestration</div>
        </div>
        <div className="cp-page-actions">
          <button className="seg-btn-secondary" type="button" onClick={handleExport}>
            <Icon name="download" size={14} /> Export
          </button>
          <button className="seg-btn-primary" type="button" onClick={() => setShowChannelModal(true)}>
            <Icon name="plus" size={14} /> Add Campaign
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="cp-filter-card">
        <div className="cp-filter-title">Filter Campaigns</div>
        <div className="cp-filter-row">
          <div className="cp-filter-group">
            <label className="cp-filter-label">Campaign</label>
            <input
              className="cp-filter-input"
              placeholder="Search campaign name"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="cp-filter-group">
            <label className="cp-filter-label">Objective</label>
            <select className="cp-filter-select" value={objective} onChange={e => setObjective(e.target.value)}>
              <option value="">All Objectives</option>
              {objectives.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="cp-filter-group">
            <label className="cp-filter-label">Channel</label>
            <select className="cp-filter-select" value={channel} onChange={e => setChannel(e.target.value)}>
              <option value="">All Channels</option>
              {channels.map(ch => <option key={ch} value={ch}>{channelLabel(ch)}</option>)}
            </select>
          </div>
          <button className="seg-btn-secondary" type="button" onClick={() => { setSearch(''); setObjective(''); setChannel(''); }}>
            Apply Filters
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="cp-table-card">
        <div className="cp-table-title">All Campaigns</div>
        <div className="seg-table-scroll">
          <table className="cp-table">
            <thead>
              <tr>
                {(['name','objective','segment','channel','schedule','status','revenue','activity'] as CpSortCol[]).map((col, i) => {
                  const labels: Record<CpSortCol, string> = { name: 'Campaign', objective: 'Objective', segment: 'Behavioral Segment', channel: 'Channels', schedule: 'Schedule', status: 'Status', revenue: 'Revenue Impact', activity: 'Last Activity' };
                  return (
                    <th key={col} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSort(s => s?.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {labels[col]}
                        <SortIcon dir={sort?.col === col ? sort.dir : null} />
                      </div>
                    </th>
                  );
                })}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {status === 'loading' ? (
                <tr><td colSpan={9} className="cp-table-empty">Loading campaigns…</td></tr>
              ) : status === 'failed' ? (
                <tr><td colSpan={9} className="cp-table-empty" style={{ color: 'var(--crm-negative, #D64545)' }}>Unable to load campaigns. Check your connection and try again.</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="cp-table-empty">
                  {rows.length === 0 ? 'No campaigns yet. Click + Add Campaign to create one.' : 'No campaigns match your filters.'}
                </td></tr>
              ) : paginated.map(c => {
                const badge = STATUS_CFG[c.status] ?? { label: c.status, cls: 'cp-badge cp-badge--draft' };
                return (
                  <tr key={c.id}>
                    <td className="cp-cell-name">{c.name}</td>
                    <td>{c.objective ?? '—'}</td>
                    <td>{c.segment_name ?? '—'}</td>
                    <td>{channelLabel(c.channel)}</td>
                    <td>{scheduleTypeLabel(c)}</td>
                    <td><span className={badge.cls}>{badge.label}</span></td>
                    <td>{formatRevenue(c.revenue_impact)}</td>
                    <td>{formatActivity(c.last_activity)}</td>
                    <td>
                      <div className="cp-actions">
                        <button
                          className="seg-row-btn"
                          type="button"
                          disabled={loadingId === c.id}
                          onClick={() => handleAction('view', c)}
                        >
                          {loadingId === c.id ? '…' : 'View'}
                        </button>
                        <button
                          className="seg-row-btn"
                          type="button"
                          disabled={loadingId === c.id}
                          onClick={() => handleAction('edit', c)}
                        >
                          {loadingId === c.id ? '…' : 'Edit'}
                        </button>
                        {/* More menu */}
                        <div className="cp-more-wrap">
                          <button
                            className="seg-row-btn cp-more-btn"
                            type="button"
                            onClick={() => setOpenMenu(openMenu === c.id ? null : c.id)}
                          >
                            <Icon name="more-horizontal" size={14} />
                          </button>
                          {openMenu === c.id && (
                            <div className="cp-more-menu">
                              <button type="button" onClick={() => handleAction('duplicate', c)}>
                                <Icon name="copy" size={13}/> Duplicate
                              </button>
                              {c.status === 'draft' || c.status === 'scheduled' ? (
                                <button type="button" onClick={() => handleAction('activate', c)}>
                                  <Icon name="play" size={13}/> Activate
                                </button>
                              ) : null}
                              {c.status === 'running' ? (
                                <button type="button" onClick={() => handleAction('pause', c)}>
                                  <Icon name="pause" size={13}/> Pause
                                </button>
                              ) : null}
                              {c.status === 'paused' ? (
                                <button type="button" onClick={() => handleAction('resume', c)}>
                                  <Icon name="play" size={13}/> Resume
                                </button>
                              ) : null}
                              {c.status !== 'cancelled' && c.status !== 'completed' ? (
                                <button type="button" className="cp-more-danger" onClick={() => handleAction('cancel', c)}>
                                  <Icon name="x-circle" size={13}/> Cancel
                                </button>
                              ) : null}
                              <div className="cp-more-divider"/>
                              <button type="button" className="cp-more-danger" onClick={() => handleAction('delete', c)}>
                                <Icon name="trash-2" size={13}/> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {filtered.length > PAGE_SIZE && (
          <div className="seg-players-pager">
            <span className="pager-info">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="pager-controls">
              <button className="pager-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
              {pageNumbers().map((n, i) =>
                n === '…'
                  ? <span key={`e${i}`} className="pager-ellipsis">…</span>
                  : <button key={n} className={'pager-btn' + (page === n ? ' active' : '')} onClick={() => setPage(n as number)}>{n}</button>
              )}
              <button className="pager-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showChannelModal && (
        <ChannelSelectModal
          onClose={() => setShowChannelModal(false)}
          onSelect={ch => { setShowChannelModal(false); setWizardChannel(ch); }}
        />
      )}

      {deleteTarget && (
        <DeleteCampaignModal
          campaign={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            dispatch(deleteCampaign({ campaignId: deleteTarget.id }));
            setDeleteTarget(null);
          }}
        />
      )}

      {/* Close more-menu on outside click */}
      {openMenu && (
        <div className="cp-overlay-dismiss" onClick={() => setOpenMenu(null)} />
      )}
    </div>
  );
}
