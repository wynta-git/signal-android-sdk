import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as dashboardApi from '../../services/dashboardApi';
import type {
  SummaryData, ChannelData, SegmentsData, CampaignsData, AnalyticsData,
} from '../../services/dashboardApi';
import type { AsyncStatus } from 'wynta-react-common/types';

// ── State ─────────────────────────────────────────────────────────────────────

interface DateRange    { start: string; end: string; }
interface CompareRange { start: string; end: string; }

interface DashboardState {
  summary:      SummaryData   | null;
  channels:     ChannelData[] | null;
  segments:     SegmentsData  | null;
  campaigns:    CampaignsData | null;
  analytics:    AnalyticsData | null;
  status: {
    summary:   AsyncStatus;
    channels:  AsyncStatus;
    segments:  AsyncStatus;
    campaigns: AsyncStatus;
    analytics: AsyncStatus;
  };
  windowDays:   number;
  dateRange:    DateRange    | null;
  compareRange: CompareRange | null;
}

const initialState: DashboardState = {
  summary:      null,
  channels:     null,
  segments:     null,
  campaigns:    null,
  analytics:    null,
  status: {
    summary:   'idle',
    channels:  'idle',
    segments:  'idle',
    campaigns: 'idle',
    analytics: 'idle',
  },
  windowDays:   7,
  dateRange:    null,
  compareRange: null,
};

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchDashboardSummary = createAsyncThunk(
  'dashboard/summary',
  ({ projectId, windowDays, startDate, endDate, compareStart, compareEnd, brandId }: {
    projectId?: string; windowDays?: number;
    startDate?: string; endDate?: string;
    compareStart?: string; compareEnd?: string;
    brandId?: number;
  } = {}) =>
    dashboardApi.fetchSummary(projectId ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo', windowDays ?? 7, startDate, endDate, compareStart, compareEnd, brandId)
);

export const fetchDashboardChannels = createAsyncThunk(
  'dashboard/channels',
  ({ projectId, windowDays, startDate, endDate, brandId }: {
    projectId?: string; windowDays?: number; startDate?: string; endDate?: string; brandId?: number;
  } = {}) =>
    dashboardApi.fetchChannels(projectId ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo', windowDays ?? 7, startDate, endDate, brandId)
);

export const fetchDashboardSegments = createAsyncThunk(
  'dashboard/segments',
  ({ projectId, limit, offset, brandId }: { projectId?: string; limit?: number; offset?: number; brandId?: number } = {}) =>
    dashboardApi.fetchSegments(projectId ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo', limit, offset, brandId)
);

export const fetchDashboardCampaigns = createAsyncThunk(
  'dashboard/campaigns',
  ({ projectId, limit, offset, brandId }: { projectId?: string; limit?: number; offset?: number; brandId?: number } = {}) =>
    dashboardApi.fetchCampaigns(projectId ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo', limit, offset, brandId)
);

export const fetchDashboardAnalytics = createAsyncThunk(
  'dashboard/analytics',
  ({ projectId, windowDays, startDate, endDate, compareStart, compareEnd, brandId }: {
    projectId?: string; windowDays?: number;
    startDate?: string; endDate?: string;
    compareStart?: string; compareEnd?: string;
    brandId?: number;
  } = {}) =>
    dashboardApi.fetchAnalytics(projectId ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo', windowDays ?? 7, startDate, endDate, compareStart, compareEnd, brandId)
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setWindowDays(state, action: { payload: number }) {
      state.windowDays = action.payload;
    },
    setDateRange(state, action: { payload: DateRange | null }) {
      state.dateRange = action.payload;
    },
    setCompareRange(state, action: { payload: CompareRange | null }) {
      state.compareRange = action.payload;
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

export const { setWindowDays, setDateRange, setCompareRange } = dashboardSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────

const safe = (s: { dashboard?: DashboardState }) => s.dashboard ?? initialState;

export const selectDashboardSummary    = (s: { dashboard?: DashboardState }) => safe(s).summary;
export const selectDashboardChannels   = (s: { dashboard?: DashboardState }) => safe(s).channels;
export const selectDashboardSegments   = (s: { dashboard?: DashboardState }) => safe(s).segments;
export const selectDashboardCampaigns  = (s: { dashboard?: DashboardState }) => safe(s).campaigns;
export const selectDashboardAnalytics  = (s: { dashboard?: DashboardState }) => safe(s).analytics;
export const selectDashboardStatus     = (s: { dashboard?: DashboardState }) => safe(s).status;
export const selectDashboardWindowDays   = (s: { dashboard?: DashboardState }) => safe(s).windowDays;
export const selectDashboardDateRange    = (s: { dashboard?: DashboardState }) => safe(s).dateRange;
export const selectDashboardCompareRange = (s: { dashboard?: DashboardState }) => safe(s).compareRange;

export default dashboardSlice.reducer;
