import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type {
  AsyncStatus,
  BonusDashboardSummary,
  BonusDashboardTopBonusesResponse,
  BonusDashboardActivityResponse,
  BonusDashboardAlertsResponse,
  BonusDashboardBudgetHealthResponse,
  DashboardDateWindow,
} from '../../types';

interface BonusDashboardState {
  summary: BonusDashboardSummary | null;
  topBonuses: BonusDashboardTopBonusesResponse | null;
  activity: BonusDashboardActivityResponse | null;
  alerts: BonusDashboardAlertsResponse | null;
  budgetHealth: BonusDashboardBudgetHealthResponse | null;
  status: {
    summary: AsyncStatus;
    topBonuses: AsyncStatus;
    activity: AsyncStatus;
    alerts: AsyncStatus;
    budgetHealth: AsyncStatus;
  };
}

const initialState: BonusDashboardState = {
  summary: null,
  topBonuses: null,
  activity: null,
  alerts: null,
  budgetHealth: null,
  status: {
    summary: 'idle',
    topBonuses: 'idle',
    activity: 'idle',
    alerts: 'idle',
    budgetHealth: 'idle',
  },
};

export const fetchDashboardSummary = createAsyncThunk(
  'bonusDashboard/summary',
  ({ siteId, window }: { siteId: string | number; window?: DashboardDateWindow }) =>
    api.fetchDashboardSummary(siteId, window)
);

export const fetchTopBonuses = createAsyncThunk(
  'bonusDashboard/topBonuses',
  ({ siteId, window, limit, offset }: {
    siteId: string | number; window?: DashboardDateWindow; limit?: number; offset?: number;
  }) => api.fetchTopBonuses(siteId, window, limit, offset)
);

export const fetchRecentActivity = createAsyncThunk(
  'bonusDashboard/activity',
  ({ siteId, limit, offset }: { siteId: string | number; limit?: number; offset?: number }) =>
    api.fetchRecentActivity(siteId, limit, offset)
);

export const fetchDashboardAlerts = createAsyncThunk(
  'bonusDashboard/alerts',
  (siteId: string | number) => api.fetchDashboardAlerts(siteId)
);

export const fetchBudgetHealth = createAsyncThunk(
  'bonusDashboard/budgetHealth',
  (siteId: string | number) => api.fetchBudgetHealth(siteId)
);

const bonusDashboardSlice = createSlice({
  name: 'bonusDashboard',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchDashboardSummary.pending,   (s) => { s.status.summary = 'loading'; })
      .addCase(fetchDashboardSummary.fulfilled, (s, a) => { s.summary = a.payload; s.status.summary = 'succeeded'; })
      .addCase(fetchDashboardSummary.rejected,  (s) => { s.status.summary = 'failed'; })

      .addCase(fetchTopBonuses.pending,   (s) => { s.status.topBonuses = 'loading'; })
      .addCase(fetchTopBonuses.fulfilled, (s, a) => { s.topBonuses = a.payload; s.status.topBonuses = 'succeeded'; })
      .addCase(fetchTopBonuses.rejected,  (s) => { s.status.topBonuses = 'failed'; })

      .addCase(fetchRecentActivity.pending,   (s) => { s.status.activity = 'loading'; })
      .addCase(fetchRecentActivity.fulfilled, (s, a) => { s.activity = a.payload; s.status.activity = 'succeeded'; })
      .addCase(fetchRecentActivity.rejected,  (s) => { s.status.activity = 'failed'; })

      .addCase(fetchDashboardAlerts.pending,   (s) => { s.status.alerts = 'loading'; })
      .addCase(fetchDashboardAlerts.fulfilled, (s, a) => { s.alerts = a.payload; s.status.alerts = 'succeeded'; })
      .addCase(fetchDashboardAlerts.rejected,  (s) => { s.status.alerts = 'failed'; })

      .addCase(fetchBudgetHealth.pending,   (s) => { s.status.budgetHealth = 'loading'; })
      .addCase(fetchBudgetHealth.fulfilled, (s, a) => { s.budgetHealth = a.payload; s.status.budgetHealth = 'succeeded'; })
      .addCase(fetchBudgetHealth.rejected,  (s) => { s.status.budgetHealth = 'failed'; });
  },
});

export default bonusDashboardSlice.reducer;
