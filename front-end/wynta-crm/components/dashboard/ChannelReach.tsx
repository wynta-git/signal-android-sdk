'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardChannels, selectDashboardStatus } from '../../store/slices/dashboardSlice';

const CHANNEL_CONFIG: Record<string, { label: string; color: string }> = {
  email:    { label: 'Email',    color: '#2196F3' },
  push:     { label: 'Push',     color: '#4CAF50' },
  sms:      { label: 'SMS',      color: '#FF9800' },
  whatsapp: { label: 'WhatsApp', color: '#9C27B0' },
  telegram: { label: 'Telegram', color: '#9E9E9E' },
  in_app:   { label: 'In-App',  color: '#F48FB1' },
};

export default function ChannelReach() {
  const channels = useAppSelector(selectDashboardChannels);
  const status   = useAppSelector(selectDashboardStatus);
  const loading  = status.channels === 'loading';

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div style={{
        background: 'var(--crm-bg)', padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--crm-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
          </svg>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>Channel Reach</h2>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ cursor: 'help' }}>
            <circle cx="7" cy="7" r="6" stroke="#d1d5db" strokeWidth="1.2" />
            <text x="7" y="11" fontSize="8" fill="#9ca3af" textAnchor="middle">i</text>
          </svg>
        </div>
        <span style={{ fontSize: 12, color: 'var(--crm-fg4)' }}>7-day window</span>
      </div>

      <div style={{ padding: '16px 20px' }}>
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 36, background: 'var(--g100)', borderRadius: 6 }} />
          ))}
        </div>
      )}

      {!loading && (!channels || channels.length === 0) && (
        <p style={{ fontSize: 12, color: 'var(--crm-fg4)', textAlign: 'center', padding: '20px 0' }}>
          No channel data available
        </p>
      )}

      {!loading && channels && channels.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {channels.map((ch, idx, arr) => {
            const config = CHANNEL_CONFIG[ch.channel] ?? { label: ch.channel, color: '#9E9E9E' };
            const pct = ch.reach_pct != null ? Math.round(ch.reach_pct * 100) : null;
            const isLive = ch.status === 'live';

            return (
              <div key={ch.channel} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                borderBottom: idx < arr.length - 1 ? '1px solid var(--crm-border)' : 'none',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: config.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--fg2)', flex: 1 }}>{config.label}</span>
                <div style={{ width: 80, background: 'var(--wynta-grey-100)', borderRadius: 3, height: 6, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{
                    width: `${Math.min(pct ?? 0, 100)}%`, background: config.color,
                    height: 6, borderRadius: 3, opacity: 0.8,
                  }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--fg3)', width: 30, textAlign: 'right', flexShrink: 0 }}>
                  {pct != null ? `${pct}%` : '—'}
                </span>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: isLive ? 'var(--crm-positive-bg)' : '#FEF3C7',
                  color: isLive ? 'var(--crm-positive)' : '#D97706',
                  flexShrink: 0,
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: isLive ? 'var(--crm-positive)' : '#D97706' }} />
                  {isLive ? 'Live' : 'Paused'}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
