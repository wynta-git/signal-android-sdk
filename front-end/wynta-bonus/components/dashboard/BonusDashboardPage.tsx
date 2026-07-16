'use client';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  fetchDashboardSummary, fetchTopBonuses, fetchRecentActivity,
  fetchDashboardAlerts, fetchBudgetHealth,
} from '../../store/slices/bonusDashboardSlice';
import type { DashboardDateWindow } from '../../types';
import DashboardDateRangePicker from './DashboardDateRangePicker';
import QuickStatsGrid from './QuickStatsGrid';
import PromoAndBonusCards from './PromoAndBonusCards';
import BonusLifecycleFunnel from './BonusLifecycleFunnel';
import TopPerformingBonusesTable from './TopPerformingBonusesTable';
import RecentActivityFeed from './RecentActivityFeed';
import NeedsAttentionCard from './NeedsAttentionCard';
import BudgetHealthCard from './BudgetHealthCard';

interface Props {
  brandId?: number;
}

export default function BonusDashboardPage({ brandId }: Props) {
  const dispatch = useAppDispatch();
  const { summary, topBonuses, activity, alerts, budgetHealth, status } = useAppSelector((s) => s.bonusDashboard);
  const [window, setWindow] = useState<DashboardDateWindow>({ windowDays: 7 });

  useEffect(() => {
    if (!brandId) return;
    dispatch(fetchDashboardSummary({ siteId: brandId, window }));
    dispatch(fetchTopBonuses({ siteId: brandId, window, limit: 10, offset: 0 }));
    dispatch(fetchRecentActivity({ siteId: brandId, limit: 20, offset: 0 }));
    dispatch(fetchDashboardAlerts(brandId));
    dispatch(fetchBudgetHealth(brandId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, brandId, window.windowDays, window.startDate, window.endDate, window.compareStart, window.compareEnd]);

  const summaryLoading = status.summary === 'loading' || status.summary === 'idle';
  const topBonusesLoading = status.topBonuses === 'loading' || status.topBonuses === 'idle';
  const activityLoading = status.activity === 'loading' || status.activity === 'idle';
  const alertsLoading = status.alerts === 'loading' || status.alerts === 'idle';
  const budgetLoading = status.budgetHealth === 'loading' || status.budgetHealth === 'idle';

  return (
    <div className="dq-dashboard">
      <div className="dq-header">
        <h1 className="dq-title">Quick Stats</h1>
        <DashboardDateRangePicker window={window} onChange={setWindow} />
      </div>

      <QuickStatsGrid summary={summary} loading={summaryLoading} />
      <PromoAndBonusCards summary={summary} loading={summaryLoading} />
      <BonusLifecycleFunnel summary={summary} loading={summaryLoading} />

      <div className="dq-bottom-grid">
        <div className="dq-bottom-main">
          <TopPerformingBonusesTable data={topBonuses} loading={topBonusesLoading} />
          <RecentActivityFeed data={activity} loading={activityLoading} />
        </div>
        <div className="dq-bottom-side">
          <NeedsAttentionCard data={alerts} loading={alertsLoading} />
          <BudgetHealthCard data={budgetHealth} loading={budgetLoading} />
        </div>
      </div>
    </div>
  );
}
