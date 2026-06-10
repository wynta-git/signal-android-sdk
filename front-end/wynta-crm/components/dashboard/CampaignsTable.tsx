'use client';
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectDashboardCampaigns, selectDashboardStatus,
  fetchDashboardCampaigns,
} from '../../store/slices/dashboardSlice';

const UNTRACKED = <span title="Not yet tracked" style={{ color: 'var(--crm-fg4)' }}>—</span>;
const PAGE_SIZE = 5;

const CHANNEL_DOT: Record<string, string> = {
  email:    '#2196F3',
  push:     '#10b981',
  sms:      '#f59e0b',
  whatsapp: '#8b5cf6',
  in_app:   '#ec4899',
  telegram: '#9E9E9E',
};
const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email', push: 'Push', sms: 'SMS',
  whatsapp: 'WhatsApp', in_app: 'In-App', telegram: 'Telegram',
};

const STATUS_LABEL: Record<string, string> = {
  running: 'Live', live: 'Live', paused: 'Paused',
  scheduled: 'Scheduled', draft: 'Draft', completed: 'Completed', cancelled: 'Cancelled',
};
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  running:   { bg: 'var(--crm-positive-bg)', fg: 'var(--crm-positive)' },
  live:      { bg: 'var(--crm-positive-bg)', fg: 'var(--crm-positive)' },
  paused:    { bg: '#FEF3C7',                fg: '#D97706'              },
  scheduled: { bg: '#FFF7ED',                fg: '#92400E'              },
  draft:     { bg: 'var(--g100)',             fg: 'var(--crm-fg4)'      },
  completed: { bg: '#EEF2FF',                fg: '#4338CA'              },
  cancelled: { bg: 'var(--crm-negative-bg)', fg: 'var(--crm-negative)' },
};

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function SortIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 14" fill="none" style={{ marginLeft: 3, flexShrink: 0 }}>
      <path d="M5 1L2 5h6L5 1z" fill="currentColor" opacity="0.5" />
      <path d="M5 13L2 9h6l-3 4z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

const TH: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--crm-fg4)', textAlign: 'left',
  padding: '10px 14px', borderBottom: '1px solid var(--crm-border)',
  whiteSpace: 'nowrap', background: 'var(--crm-white)',
};
const TD: React.CSSProperties = {
  fontSize: 12, color: 'var(--crm-fg2)', padding: '10px 14px',
  borderBottom: '1px solid var(--crm-border)',
};

export default function CampaignsTable({ onNavigate }: { onNavigate?: (nav: string) => void }) {
  const dispatch  = useAppDispatch();
  const campaigns = useAppSelector(selectDashboardCampaigns);
  const status    = useAppSelector(selectDashboardStatus);
  const loading   = status.campaigns === 'loading';
  const [page, setPage] = useState(0);

  const total = campaigns?.total ?? 0;
  const items = campaigns?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showing = Math.min(items.length, PAGE_SIZE);

  function goTo(p: number) {
    setPage(p);
    dispatch(fetchDashboardCampaigns({ offset: p * PAGE_SIZE, limit: PAGE_SIZE }));
  }

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--crm-bg)', padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--crm-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>Live Campaign Performance</h2>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
            <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
            <text x="7" y="11" fontSize="8" fill="#9ca3af" textAnchor="middle">i</text>
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)',
            border: '1px solid var(--crm-border)', borderRadius: 5,
            padding: '5px 12px', background: 'var(--crm-white)', cursor: 'pointer',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filter
          </button>
          <button
            onClick={() => onNavigate?.('campaigns:add')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 600, color: '#fff',
              border: 'none', borderRadius: 5,
              padding: '5px 12px', background: 'var(--crm-blue)', cursor: 'pointer',
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Campaign
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Campaign <SortIcon /></div>
              </th>
              <th style={TH}>Channel</th>
              <th style={TH}>Segment</th>
              <th style={TH}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Sent <SortIcon /></div>
              </th>
              <th style={TH}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Open Rate <SortIcon /></div>
              </th>
              <th style={TH}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>CTR <SortIcon /></div>
              </th>
              <th style={TH}>
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>Click-throughs <SortIcon /></div>
              </th>
              <th style={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--crm-fg4)' }}>Loading…</td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--crm-fg4)' }}>No campaigns found</td>
              </tr>
            )}
            {!loading && items.slice(0, PAGE_SIZE).map(c => {
              const st = STATUS_STYLE[c.status] ?? { bg: 'var(--g100)', fg: 'var(--crm-fg4)' };
              const stLabel = STATUS_LABEL[c.status] ?? c.status;
              const isLive = c.status === 'running' || c.status === 'live';
              const dotColor = CHANNEL_DOT[c.channel] ?? '#9E9E9E';
              const chanLabel = CHANNEL_LABEL[c.channel] ?? c.channel;
              const openRate = c.open_rate != null ? c.open_rate : null;
              const ctr = c.ctr != null ? c.ctr : null;
              const isGoodOR = openRate != null && openRate >= 0.2;
              const isGoodCTR = ctr != null && ctr >= 0.05;
              const isBadCTR = ctr != null && ctr < 0.02;
              return (
                <tr key={c.campaign_id}>
                  {/* Campaign */}
                  <td style={TD}>
                    <span style={{ fontWeight: 500, color: 'var(--crm-blue)', cursor: 'pointer' }}>{c.name}</span>
                  </td>
                  {/* Channel */}
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ color: 'var(--crm-fg2)' }}>{chanLabel}</span>
                    </div>
                  </td>
                  {/* Segment */}
                  <td style={TD}>
                    {c.segment_name ? (
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20,
                        background: '#EFF6FF', color: '#1D4ED8',
                      }}>{c.segment_name}</span>
                    ) : <span style={{ color: 'var(--crm-fg4)' }}>—</span>}
                  </td>
                  {/* Sent */}
                  <td style={{ ...TD, fontWeight: 600, color: 'var(--crm-fg1)' }}>
                    {fmt(c.total_sent)}
                  </td>
                  {/* Open Rate */}
                  <td style={{ ...TD, fontWeight: 600, color: isGoodOR ? 'var(--crm-positive)' : 'var(--crm-fg2)' }}>
                    {openRate != null ? `${(openRate * 100).toFixed(0)}%` : UNTRACKED}
                  </td>
                  {/* CTR */}
                  <td style={{ ...TD, fontWeight: 600, color: isGoodCTR ? 'var(--crm-positive)' : isBadCTR ? 'var(--crm-negative, #ef4444)' : 'var(--crm-fg2)' }}>
                    {ctr != null ? `${(ctr * 100).toFixed(1)}%` : UNTRACKED}
                  </td>
                  {/* Click-throughs */}
                  <td style={{ ...TD, fontWeight: 600, color: 'var(--crm-fg1)' }}>
                    {c.click_throughs != null ? fmt(c.click_throughs) : UNTRACKED}
                  </td>
                  {/* Status */}
                  <td style={TD}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      background: st.bg, color: st.fg,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                      {stLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!loading && total > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: '1px solid var(--crm-border)',
          background: 'var(--crm-white)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--crm-fg3)' }}>
            Showing {showing} of {total} campaigns
            {totalPages > 1 && (
              <>
                {' '}—{' '}
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); onNavigate?.('campaigns'); }}
                  style={{ color: 'var(--crm-blue)', textDecoration: 'none', fontWeight: 500 }}
                >
                  view all
                </a>
              </>
            )}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                disabled={page === 0}
                onClick={() => goTo(page - 1)}
                style={{
                  fontSize: 11, padding: '3px 10px', border: '1px solid var(--crm-border)',
                  borderRadius: 5, background: page === 0 ? 'var(--g100)' : 'var(--crm-white)',
                  color: page === 0 ? 'var(--crm-fg4)' : 'var(--crm-fg2)', cursor: page === 0 ? 'default' : 'pointer',
                }}
              >‹ Prev</button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => goTo(page + 1)}
                style={{
                  fontSize: 11, padding: '3px 10px', border: '1px solid var(--crm-border)',
                  borderRadius: 5, background: page >= totalPages - 1 ? 'var(--g100)' : 'var(--crm-white)',
                  color: page >= totalPages - 1 ? 'var(--crm-fg4)' : 'var(--crm-fg2)',
                  cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                }}
              >Next ›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
