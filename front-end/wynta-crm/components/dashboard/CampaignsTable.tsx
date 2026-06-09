'use client';
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectDashboardCampaigns, selectDashboardStatus,
  fetchDashboardCampaigns,
} from '../../store/slices/dashboardSlice';
const UNTRACKED = <span title="Not yet tracked — requires provider delivery callbacks" style={{ color: 'var(--crm-fg4)' }}>—</span>;
const PAGE_SIZE = 10;

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  running:   { bg: 'var(--crm-positive-bg)', fg: 'var(--crm-positive)' },
  paused:    { bg: 'var(--g100)',             fg: 'var(--crm-fg4)'      },
  scheduled: { bg: '#FFF7ED',                fg: '#92400E'              },
  draft:     { bg: 'var(--g100)',             fg: 'var(--crm-fg4)'      },
  completed: { bg: '#EEF2FF',                fg: '#4338CA'              },
  cancelled: { bg: 'var(--crm-negative-bg)', fg: 'var(--crm-negative)' },
};


const TH: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--crm-fg4)', textAlign: 'left',
  padding: '9px 14px', borderBottom: '1px solid var(--crm-border)',
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  fontSize: 13, color: 'var(--crm-fg2)', padding: '12px 14px',
  borderBottom: '1px solid #F1F2F4',
};

export default function CampaignsTable() {
  const dispatch  = useAppDispatch();
  const campaigns = useAppSelector(selectDashboardCampaigns);
  const status    = useAppSelector(selectDashboardStatus);
  const loading   = status.campaigns === 'loading';
  const [page, setPage]   = useState(0);

  const total = campaigns?.total ?? 0;
  const items = campaigns?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function goTo(p: number) {
    setPage(p);
    dispatch(fetchDashboardCampaigns({ offset: p * PAGE_SIZE, limit: PAGE_SIZE }));
  }

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div style={{ background: 'var(--crm-bg)', padding: '12px 20px', borderBottom: '1px solid var(--crm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)' }}>Live Campaigns</h2>
        {total > 0 && (
          <span style={{ fontSize: 11, color: 'var(--crm-fg4)' }}>{total} total</span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Campaign</th>
              <th style={TH}>Channel</th>
              <th style={TH}>Status</th>
              <th style={TH}>Segment</th>
              <th style={{ ...TH, textAlign: 'right' }}>Sent</th>
              <th style={{ ...TH, textAlign: 'right' }}>Open Rate</th>
              <th style={{ ...TH, textAlign: 'right' }}>CTR</th>
              <th style={{ ...TH, textAlign: 'right' }}>Click-throughs</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--crm-fg4)' }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--crm-fg4)' }}>
                  No campaigns found
                </td>
              </tr>
            )}
            {!loading && items.map(c => {
              const st = STATUS_STYLE[c.status] ?? { bg: 'var(--g100)', fg: 'var(--crm-fg4)' };
              return (
                <tr key={c.campaign_id}>
                  <td style={TD}>
                    <span style={{ fontWeight: 500, color: 'var(--crm-fg1)' }}>{c.name}</span>
                  </td>
                  <td style={TD}>
                    <span>{c.channel}</span>
                  </td>
                  <td style={TD}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      background: st.bg, color: st.fg,
                    }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ ...TD, color: 'var(--crm-fg3)' }}>{c.segment_name || '—'}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>{fmt(c.total_sent)}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{UNTRACKED}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{UNTRACKED}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{UNTRACKED}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--crm-border)' }}>
          <button
            disabled={page === 0}
            onClick={() => goTo(page - 1)}
            style={{
              fontSize: 12, padding: '4px 10px', border: '1px solid var(--crm-border)',
              borderRadius: 6, background: page === 0 ? 'var(--g50)' : 'var(--crm-white)',
              color: page === 0 ? 'var(--crm-fg4)' : 'var(--crm-fg2)', cursor: page === 0 ? 'default' : 'pointer',
            }}
          >
            Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--crm-fg3)' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => goTo(page + 1)}
            style={{
              fontSize: 12, padding: '4px 10px', border: '1px solid var(--crm-border)',
              borderRadius: 6, background: page >= totalPages - 1 ? 'var(--g50)' : 'var(--crm-white)',
              color: page >= totalPages - 1 ? 'var(--crm-fg4)' : 'var(--crm-fg2)',
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
