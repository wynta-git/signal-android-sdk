import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as dashboardApi from '../../services/dashboardApi';
import type {
  SummaryData, ChannelData, SegmentsData, CampaignsData, AnalyticsData,
} from '../../services/dashboardApi';
import type { AsyncStatus } from 'wynta-react-common/types';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

// ── State ─────────────────────────────────────────────────────────────────────

interface DashboardState {
  summary:   SummaryData   | null;
  channels:  ChannelData[] | null;
  segments:  SegmentsData  | null;
  campaigns: CampaignsData | null;
  analytics: AnalyticsData | null;
  status: {
    summary:   AsyncStatus;
    channels:  AsyncStatus;
    segments:  AsyncStatus;
    campaigns: AsyncStatus;
    analytics: AsyncStatus;
  };
  windowDays: number;
}

const initialState: DashboardState = {
  summary:   null,
  channels:  null,
  segments:  null,
  campaigns: null,
  analytics: null,
  status: {
    summary:   'idle',
    channels:  'idle',
    segments:  'idle',
    campaigns: 'idle',
    analytics: 'idle',
  },
  windowDays: 7,
};

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchDashboardSummary = createAsyncThunk(
  'dashboard/summary',
  ({ projectId, windowDays }: { projectId?: string; windowDays?: number } = {}) =>
    dashboardApi.fetchSummary(projectId ?? PROJECT_ID, windowDays ?? 7)
);

export const fetchDashboardChannels = createAsyncThunk(
  'dashboard/channels',
  ({ projectId, windowDays }: { projectId?: string; windowDays?: number } = {}) =>
    dashboardApi.fetchChannels(projectId ?? PROJECT_ID, windowDays ?? 7)
);

export const fetchDashboardSegments = createAsyncThunk(
  'dashboard/segments',
  ({ projectId, limit, offset }: { projectId?: string; limit?: number; offset?: number } = {}) =>
    dashboardApi.fetchSegments(projectId ?? PROJECT_ID, limit, offset)
);

export const fetchDashboardCampaigns = createAsyncThunk(
  'dashboard/campaigns',
  ({ projectId, limit, offset }: { projectId?: string; limit?: number; offset?: number } = {}) =>
    dashboardApi.fetchCampaigns(projectId ?? PROJECT_ID, limit, offset)
);

export const fetchDashboardAnalytics = createAsyncThunk(
  'dashboard/analytics',
  ({ projectId, windowDays }: { projectId?: string; windowDays?: number } = {}) =>
    dashboardApi.fetchAnalytics(projectId ?? PROJECT_ID, windowDays ?? 30)
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setWindowDays(state, action: { payload: number }) {
      state.windowDays = action.payload;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchDashboardSummary.pending,   s => { s.status.summary = 'loading'; })
      .addCase(fetchDashboardSummary.rejected,  s => { s.status.summary = 'failed'; })
      .addCase(fetchDashboardSummary.fulfilled, (s, a) => { s.status.summary = 'succeeded'; s.summary = a.payload; })

      .addCase(fetchDashboardChannels.pending,   s => { s.status.channels = 'loading'; })
      .addCase(fetchDashboardChannels.rejected,  s => { s.status.channels = 'failed'; })
      .addCase(fetchDashboardChannels.fulfilled, (s, a) => { s.status.channels = 'succeeded'; s.channels = a.payload; })

      .addCase(fetchDashboardSegments.pending,   s => { s.status.segments = 'loading'; })
      .addCase(fetchDashboardSegments.rejected,  s => { s.status.segments = 'failed'; })
      .addCase(fetchDashboardSegments.fulfilled, (s, a) => { s.status.segments = 'succeeded'; s.segments = a.payload; })

      .addCase(fetchDashboardCampaigns.pending,   s => { s.status.campaigns = 'loading'; })
      .addCase(fetchDashboardCampaigns.rejected,  s => { s.status.campaigns = 'failed'; })
      .addCase(fetchDashboardCampaigns.fulfilled, (s, a) => { s.status.campaigns = 'succeeded'; s.campaigns = a.payload; })

      .addCase(fetchDashboardAnalytics.pending,   s => { s.status.analytics = 'loading'; })
      .addCase(fetchDashboardAnalytics.rejected,  s => { s.status.analytics = 'failed'; })
      .addCase(fetchDashboardAnalytics.fulfilled, (s, a) => { s.status.analytics = 'succeeded'; s.analytics = a.payload; });
  },
});

export const { setWindowDays } = dashboardSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────

const safe = (s: { dashboard?: DashboardState }) => s.dashboard ?? initialState;

export const selectDashboardSummary    = (s: { dashboard?: DashboardState }) => safe(s).summary;
export const selectDashboardChannels   = (s: { dashboard?: DashboardState }) => safe(s).channels;
export const selectDashboardSegments   = (s: { dashboard?: DashboardState }) => safe(s).segments;
export const selectDashboardCampaigns  = (s: { dashboard?: DashboardState }) => safe(s).campaigns;
export const selectDashboardAnalytics  = (s: { dashboard?: DashboardState }) => safe(s).analytics;
export const selectDashboardStatus     = (s: { dashboard?: DashboardState }) => safe(s).status;
export const selectDashboardWindowDays = (s: { dashboard?: DashboardState }) => safe(s).windowDays;

export default dashboardSlice.reducer;
