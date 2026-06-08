'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardChannels, selectDashboardStatus } from '../../store/slices/dashboardSlice';

const CHANNEL_ICON: Record<string, string> = {
  push:      '🔔',
  email:     '✉️',
  sms:       '💬',
  in_app:    '📱',
  on_site:   '🌐',
  whatsapp:  '💚',
  telegram:  '✈️',
  rcs:       '📨',
};

export default function ChannelReach() {
  const channels = useAppSelector(selectDashboardChannels);
  const status   = useAppSelector(selectDashboardStatus);
  const loading  = status.channels === 'loading';

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-fg1)' }}>Channel Reach</h2>
      </div>

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {channels.map(ch => (
            <div key={ch.channel}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 14 }}>{CHANNEL_ICON[ch.channel] ?? '📡'}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)' }}>
                    {ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1)}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                    background: ch.status === 'live' ? 'var(--crm-positive-bg)' : 'var(--g100)',
                    color: ch.status === 'live' ? 'var(--crm-positive)' : 'var(--crm-fg4)',
                  }}>
                    {ch.status === 'live' ? 'Live' : 'Paused'}
                  </span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-fg1)' }}>
                  {ch.reach_pct != null ? `${Math.round(ch.reach_pct * 100)}%` : '—'}
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--g100)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min((ch.reach_pct ?? 0) * 100, 100)}%`,
                  background: ch.status === 'live' ? 'var(--crm-blue)' : 'var(--g300)',
                  borderRadius: 4, transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
