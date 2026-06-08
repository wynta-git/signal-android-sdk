'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  fetchDashboardSummary,
  fetchDashboardChannels,
  fetchDashboardSegments,
  fetchDashboardCampaigns,
  fetchDashboardAnalytics,
  setWindowDays,
  selectDashboardWindowDays,
} from '../../store/slices/dashboardSlice';
import { getToken } from 'wynta-react-common/services/tokenRegistry';
import QuickStats        from './QuickStats';
import ChannelReach      from './ChannelReach';
import PlayerSegments    from './PlayerSegments';
import ChannelsTable     from './ChannelsTable';
import CampaignsTable    from './CampaignsTable';
import AnalyticsChart    from './AnalyticsChart';
import PlayerHealth      from './PlayerHealth';
import SegmentsBreakdown from './SegmentsBreakdown';

const WINDOW_OPTIONS = [
  { label: 'Last 7 days',  value: 7  },
  { label: 'Last 14 days', value: 14 },
  { label: 'Last 30 days', value: 30 },
];

export default function DashboardPage() {
  const dispatch   = useAppDispatch();
  const windowDays = useAppSelector(selectDashboardWindowDays);
  const pathname   = usePathname();

  function loadAll(w: number) {
    dispatch(fetchDashboardSummary({ windowDays: w }));
    dispatch(fetchDashboardChannels({ windowDays: w }));
    dispatch(fetchDashboardSegments({}));
    dispatch(fetchDashboardCampaigns({}));
    dispatch(fetchDashboardAnalytics({ windowDays: 30 }));
  }

  useEffect(() => {
    if (getToken()) {
      loadAll(windowDays);
      return;
    }
    // Token not ready yet (first load race) — poll until available
    const interval = setInterval(() => {
      if (getToken()) {
        clearInterval(interval);
        loadAll(windowDays);
      }
    }, 300);
    return () => clearInterval(interval);
  // pathname in deps means this re-runs every time user navigates back to dashboard
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function handleWindowChange(w: number) {
    dispatch(setWindowDays(w));
    loadAll(w);
  }

  return (
    <div style={{ padding: '20px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header — matches .seg-page-header / .cp-page-header pattern */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--crm-fg1)', lineHeight: 1.2, marginBottom: 4 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--crm-fg3)' }}>Overview of players, campaigns and channel performance</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <select
            value={windowDays}
            onChange={e => handleWindowChange(Number(e.target.value))}
            style={{
              height: 36, padding: '0 10px', border: '1px solid var(--crm-border-md)',
              borderRadius: 4, background: 'var(--crm-white)', color: 'var(--crm-fg2)',
              fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
            }}
          >
            {WINDOW_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => loadAll(windowDays)}
            style={{
              height: 36, padding: '0 14px', border: '1px solid var(--crm-border-md)',
              borderRadius: 4, background: 'var(--crm-white)', color: 'var(--crm-fg2)',
              fontSize: 13, fontFamily: 'inherit', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Row 1: Quick stats */}
      <QuickStats />

      {/* Row 2: Channel reach + Player segments */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChannelReach />
        <PlayerSegments />
      </div>

      {/* Row 3: All-channels performance table */}
      <ChannelsTable />

      {/* Row 4: Live campaigns table */}
      <CampaignsTable />

      {/* Row 5: Analytics chart + MTD panel */}
      <AnalyticsChart />

      {/* Row 6: Player health + Segments breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <PlayerHealth />
        <SegmentsBreakdown />
      </div>
    </div>
  );
}
