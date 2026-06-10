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
  setDateRange,
  setCompareRange,
  selectDashboardWindowDays,
  selectDashboardDateRange,
  selectDashboardCompareRange,
} from '../../store/slices/dashboardSlice';

function toISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function defaultRange(days: number): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));
  return { start: toISO(start), end: toISO(today) };
}

function defaultCompare(range: { start: string; end: string }): { start: string; end: string } {
  const start = new Date(range.start);
  const end   = new Date(range.end);
  const days  = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const compEnd   = new Date(start); compEnd.setDate(compEnd.getDate() - 1);
  const compStart = new Date(compEnd); compStart.setDate(compStart.getDate() - (days - 1));
  return { start: toISO(compStart), end: toISO(compEnd) };
}
import { getToken } from 'wynta-react-common/services/tokenRegistry';
import QuickStats        from './QuickStats';
import ChannelReach      from './ChannelReach';
import PlayerSegments    from './PlayerSegments';
import ChannelsTable     from './ChannelsTable';
import CampaignsTable    from './CampaignsTable';
import AnalyticsChart    from './AnalyticsChart';
import PlayerHealth      from './PlayerHealth';
import SegmentsBreakdown from './SegmentsBreakdown';
import DateRangePicker   from './DateRangePicker';

export default function DashboardPage({ onNavChange }: { onNavChange?: (nav: string) => void }) {
  const dispatch   = useAppDispatch();
  const windowDays   = useAppSelector(selectDashboardWindowDays);
  const dateRange    = useAppSelector(selectDashboardDateRange);
  const compareRange = useAppSelector(selectDashboardCompareRange);
  const pathname   = usePathname();

  function loadAll(
    w: number,
    range: { start: string; end: string },
    compare?: { start: string; end: string },
  ) {
    dispatch(fetchDashboardSummary({ windowDays: w, startDate: range.start, endDate: range.end, compareStart: compare?.start, compareEnd: compare?.end }));
    dispatch(fetchDashboardChannels({ windowDays: w, startDate: range.start, endDate: range.end }));
    dispatch(fetchDashboardSegments({}));
    dispatch(fetchDashboardCampaigns({}));
    dispatch(fetchDashboardAnalytics({ windowDays: w, startDate: range.start, endDate: range.end, compareStart: compare?.start, compareEnd: compare?.end }));
  }

  useEffect(() => {
    const range   = dateRange   ?? defaultRange(windowDays);
    const compare = compareRange ?? defaultCompare(range);
    if (getToken()) {
      loadAll(windowDays, range, compare);
      return;
    }
    // Token not ready yet (first load race) — poll until available
    const interval = setInterval(() => {
      if (getToken()) {
        clearInterval(interval);
        loadAll(windowDays, range, compare);
      }
    }, 300);
    return () => clearInterval(interval);
  // pathname in deps means this re-runs every time user navigates back to dashboard
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function handleWindowChange(
    w: number,
    range: { start: string; end: string },
    compare?: { start: string; end: string },
  ) {
    dispatch(setWindowDays(w));
    dispatch(setDateRange(range));
    dispatch(setCompareRange(compare ?? null));
    loadAll(w, range, compare);
  }

  return (
    <div style={{ padding: '20px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header — matches .seg-page-header / .cp-page-header pattern */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-fg1)', lineHeight: 1.2, marginBottom: 4 }}>Quick Stats</h1>
          {/* <p style={{ fontSize: 13, color: 'var(--crm-fg3)' }}>Overview of players, campaigns and channel performance</p> */}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <DateRangePicker windowDays={windowDays} onChange={handleWindowChange} />
        </div>
      </div>

      {/* Row 1: Quick stats */}
      <QuickStats />

      {/* Row 2: Channel reach + Player segments */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChannelReach />
        <PlayerSegments onNavigate={onNavChange} />
      </div>

      {/* Row 3: All-channels performance table */}
      <ChannelsTable onNavigate={onNavChange} />

      {/* Row 4: Live campaigns table */}
      <CampaignsTable onNavigate={onNavChange} />

      {/* Row 5: Analytics chart */}
      <AnalyticsChart />

      {/* Row 6: Player health + Segments breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <PlayerHealth />
        <SegmentsBreakdown />
      </div>
    </div>
  );
}
