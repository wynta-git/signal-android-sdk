'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardChannels, selectDashboardStatus } from '../../store/slices/dashboardSlice';
import type { ChannelData } from '../../services/dashboardApi';

const UNTRACKED = <span title="Not yet tracked" style={{ color: 'var(--crm-fg4)' }}>—</span>;

const CHANNEL_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  email: {
    label: 'Email', color: '#2196F3', bg: '#e8f4ff',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2196F3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  },
  push: {
    label: 'Push', color: '#10b981', bg: '#e6f6ec',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
  },
  in_app: {
    label: 'In-App', color: '#ec4899', bg: '#fde8f3',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  },
  sms: {
    label: 'SMS', color: '#f59e0b', bg: '#fff8e1',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>,
  },
  whatsapp: {
    label: 'WhatsApp', color: '#8b5cf6', bg: '#f3e8ff',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h8M8 14h5"/></svg>,
  },
  telegram: {
    label: 'Telegram', color: '#9E9E9E', bg: '#f3f4f6',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9E9E9E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
  },
};

function Sparkline({ data, color }: { data: ChannelData['trend_7d']; color: string }) {
  if (!data || data.length < 2) return <span style={{ color: 'var(--crm-fg4)' }}>—</span>;
  const vals = data.map(t => t.sent);
  const max = Math.max(...vals, 1);
  const W = 60, H = 24;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - (v / max) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
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

export default function ChannelsTable({ onNavigate }: { onNavigate?: (nav: string) => void }) {
  const channels = useAppSelector(selectDashboardChannels);
  const status   = useAppSelector(selectDashboardStatus);
  const loading  = status.channels === 'loading';

  const liveCount   = channels?.filter(c => c.status === 'live').length ?? 0;
  const pausedCount = channels?.filter(c => c.status !== 'live').length ?? 0;
  const pausedNames = channels?.filter(c => c.status !== 'live').map(c => CHANNEL_CONFIG[c.channel]?.label ?? c.channel) ?? [];

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
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>All Channels — Status &amp; Performance</h2>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
            <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
            <text x="7" y="11" fontSize="8" fill="#9ca3af" textAnchor="middle">i</text>
          </svg>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)',
          border: '1px solid var(--crm-border)', borderRadius: 5,
          padding: '5px 12px', background: 'var(--crm-white)', cursor: 'pointer',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Channel</th>
              <th style={TH}>Status</th>
              <th style={TH}>Messages Sent</th>
              <th style={TH}>Delivery Rate</th>
              <th style={TH}>Open Rate</th>
              <th style={TH}>CTR</th>
              <th style={{ ...TH }}>Reach Score</th>
              <th style={TH}>Trend (7d)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--crm-fg4)' }}>Loading…</td>
              </tr>
            )}
            {!loading && (!channels || channels.length === 0) && (
              <tr>
                <td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--crm-fg4)' }}>No channel data available</td>
              </tr>
            )}
            {!loading && channels && channels.map(ch => {
              const cfg = CHANNEL_CONFIG[ch.channel] ?? { label: ch.channel, color: '#9E9E9E', bg: '#f3f4f6', icon: null };
              const reachPct = ch.reach_pct != null ? Math.round(ch.reach_pct * 100) : null;
              const isLive = ch.status === 'live';
              const isPositiveDR = ch.delivery_rate != null && ch.delivery_rate >= 0.9;
              const isPositiveOR = ch.open_rate != null && ch.open_rate >= 0.2;
              const isPositiveCTR = ch.ctr != null && ch.ctr >= 0.05;
              return (
                <tr key={ch.channel}>
                  {/* Channel */}
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 4, background: cfg.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {cfg.icon}
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--crm-fg1)' }}>{cfg.label}</span>
                    </div>
                  </td>
                  {/* Status */}
                  <td style={TD}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      background: isLive ? 'var(--crm-positive-bg)' : '#FEF3C7',
                      color: isLive ? 'var(--crm-positive)' : '#D97706',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                      {isLive ? 'Live' : 'Paused'}
                    </span>
                  </td>
                  {/* Messages Sent */}
                  <td style={{ ...TD, fontWeight: 500 }}>{fmt(ch.messages_sent)}</td>
                  {/* Delivery Rate */}
                  <td style={{ ...TD, fontWeight: 600, color: isPositiveDR ? 'var(--crm-positive)' : 'var(--crm-fg2)' }}>
                    {ch.delivery_rate != null ? `${(ch.delivery_rate * 100).toFixed(1)}%` : UNTRACKED}
                  </td>
                  {/* Open Rate */}
                  <td style={{ ...TD, fontWeight: 600, color: isPositiveOR ? 'var(--crm-positive)' : 'var(--crm-fg2)' }}>
                    {ch.open_rate != null ? `${(ch.open_rate * 100).toFixed(1)}%` : UNTRACKED}
                  </td>
                  {/* CTR */}
                  <td style={{ ...TD, fontWeight: 600, color: isPositiveCTR ? 'var(--crm-positive)' : 'var(--crm-fg2)' }}>
                    {ch.ctr != null ? `${(ch.ctr * 100).toFixed(1)}%` : UNTRACKED}
                  </td>
                  {/* Reach Score */}
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 64, height: 5, background: 'var(--crm-border)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: `${reachPct ?? 0}%`, height: '100%', background: cfg.color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--crm-fg2)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {reachPct != null ? `${reachPct}%` : '—'}
                      </span>
                    </div>
                  </td>
                  {/* Trend */}
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <Sparkline data={ch.trend_7d} color={cfg.color} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!loading && channels && channels.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', borderTop: '1px solid var(--crm-border)',
          background: 'var(--crm-white)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--crm-fg3)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--crm-positive)', fontWeight: 500 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--crm-positive)', display: 'inline-block' }} />
              {liveCount} Live
            </span>
            {pausedCount > 0 && (
              <>
                <span style={{ margin: '0 4px' }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#D97706', fontWeight: 500 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
                  {pausedCount} Paused
                </span>
                <span style={{ marginLeft: 6 }}>— {pausedNames.join(', ')} campaign manually paused</span>
              </>
            )}
          </div>
          <a
            href="#"
            onClick={e => { e.preventDefault(); onNavigate?.('integrations'); }}
            style={{ fontSize: 12, color: 'var(--crm-blue)', textDecoration: 'none', fontWeight: 500 }}
          >
            Configure channels →
          </a>
        </div>
      )}
    </div>
  );
}
