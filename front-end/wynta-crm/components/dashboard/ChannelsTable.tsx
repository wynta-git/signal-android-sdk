'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardChannels, selectDashboardStatus } from '../../store/slices/dashboardSlice';
import type { TrackedMetric } from '../../services/dashboardApi';

const UNTRACKED_TITLE = 'Not yet tracked — requires provider delivery callbacks';

function TrackedCell({ v }: { v: TrackedMetric | undefined }) {
  if (!v || !v.tracked || v.value === null) {
    return <span title={UNTRACKED_TITLE} style={{ color: 'var(--crm-fg4)' }}>—</span>;
  }
  return <>{v.value.toFixed(1)}%</>;
}

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return <span style={{ color: 'var(--crm-fg4)' }}>—</span>;
  const max = Math.max(...data, 1);
  const W = 56, H = 22;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x},${y}`;
  }).join(' ');
  const lastUp = data[data.length - 1] >= data[data.length - 2];
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
                    {ch.display_name || ch.channel}
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
                <td style={{ ...TD, textAlign: 'right' }}>
                  {ch.delivery_rate != null ? `${ch.delivery_rate.toFixed(1)}%` : (
                    <span title={UNTRACKED_TITLE} style={{ color: 'var(--crm-fg4)' }}>—</span>
                  )}
                </td>
                <td style={{ ...TD, textAlign: 'right' }}>
                  <TrackedCell v={ch.open_rate} />
                </td>
                <td style={{ ...TD, textAlign: 'right' }}>
                  <TrackedCell v={ch.ctr} />
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
