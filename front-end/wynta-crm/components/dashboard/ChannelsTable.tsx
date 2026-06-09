'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardChannels, selectDashboardStatus } from '../../store/slices/dashboardSlice';
import type { ChannelData } from '../../services/dashboardApi';

const UNTRACKED = <span title="Not yet tracked — requires provider delivery callbacks" style={{ color: 'var(--crm-fg4)' }}>—</span>;

const CHANNEL_LABEL: Record<string, string> = {
  email:    'Email',
  push:     'Push',
  sms:      'SMS',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  in_app:   'In-App',
};

function Sparkline({ data }: { data: ChannelData['trend_7d'] }) {
  if (!data || data.length < 2) return <span style={{ color: 'var(--crm-fg4)' }}>—</span>;
  const vals = data.map(t => t.sent);
  const max = Math.max(...vals, 1);
  const W = 56, H = 22;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x},${y}`;
  }).join(' ');
  const lastUp = vals[vals.length - 1] >= vals[vals.length - 2];
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={lastUp ? 'var(--crm-positive)' : 'var(--crm-negative)'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
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
  fontSize: 10.5, fontWeight: 700, color: 'var(--crm-fg4)', textAlign: 'left',
  padding: '9px 14px', borderBottom: '1px solid var(--crm-border)',
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  fontSize: 13, color: 'var(--crm-fg2)', padding: '12px 14px',
  borderBottom: '1px solid #F1F2F4',
};

export default function ChannelsTable() {
  const channels = useAppSelector(selectDashboardChannels);
  const status   = useAppSelector(selectDashboardStatus);
  const loading  = status.channels === 'loading';

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--crm-border)' }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)' }}>All Channels — Performance</h2>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Channel</th>
              <th style={TH}>Status</th>
              <th style={{ ...TH, textAlign: 'right' }}>Messages Sent</th>
              <th style={{ ...TH, textAlign: 'right' }}>Delivery Rate</th>
              <th style={{ ...TH, textAlign: 'right' }}>Open Rate</th>
              <th style={{ ...TH, textAlign: 'right' }}>CTR</th>
              <th style={{ ...TH, textAlign: 'center' }}>7-day Trend</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{ ...TD, textAlign: 'center', color: 'var(--crm-fg4)' }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && (!channels || channels.length === 0) && (
              <tr>
                <td colSpan={7} style={{ ...TD, textAlign: 'center', color: 'var(--crm-fg4)' }}>
                  No channel data available
                </td>
              </tr>
            )}
            {!loading && channels && channels.map(ch => (
              <tr key={ch.channel}>
                <td style={TD}>
                  <span style={{ fontWeight: 500, color: 'var(--crm-fg1)' }}>
                    {CHANNEL_LABEL[ch.channel] ?? ch.channel}
                  </span>
                </td>
                <td style={TD}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: ch.status === 'live' ? 'var(--crm-positive-bg)' : 'var(--g100)',
                    color: ch.status === 'live' ? 'var(--crm-positive)' : 'var(--crm-fg4)',
                  }}>
                    {ch.status === 'live' ? 'Live' : 'Paused'}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 500 }}>
                  {fmt(ch.messages_sent)}
                </td>
                <td style={{ ...TD, textAlign: 'right', color: 'var(--crm-positive)', fontWeight: 600 }}>
                  {ch.delivery_rate != null ? `${(ch.delivery_rate * 100).toFixed(1)}%` : UNTRACKED}
                </td>
                <td style={{ ...TD, textAlign: 'right', color: 'var(--crm-positive)', fontWeight: 600 }}>
                  {ch.open_rate != null ? `${(ch.open_rate * 100).toFixed(1)}%` : UNTRACKED}
                </td>
                <td style={{ ...TD, textAlign: 'right', color: 'var(--crm-positive)', fontWeight: 600 }}>
                  {ch.ctr != null ? `${(ch.ctr * 100).toFixed(1)}%` : UNTRACKED}
                </td>
                <td style={{ ...TD, textAlign: 'center' }}>
                  <Sparkline data={ch.trend_7d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
