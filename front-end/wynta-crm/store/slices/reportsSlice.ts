import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as reportsApi from '../../services/reportsApi';
import type { CustomReport, CustomReportWithData, CreateReportPayload } from '../../services/reportsApi';
import type { AsyncStatus } from 'wynta-react-common/types';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

interface ReportsState {
  reports: CustomReport[];
  activeReport: CustomReportWithData | null;
  status: {
    list:     AsyncStatus;
    active:   AsyncStatus;
    creating: AsyncStatus;
  };
}

const initialState: ReportsState = {
  reports: [],
  activeReport: null,
  status: { list: 'idle', active: 'idle', creating: 'idle' },
};

export const fetchReports = createAsyncThunk(
  'reports/list',
  (projectId?: string) => reportsApi.listReports(projectId ?? PROJECT_ID),
);

export const fetchReport = createAsyncThunk(
  'reports/get',
  ({ reportId, projectId }: { reportId: string; projectId?: string }) =>
    reportsApi.getReport(projectId ?? PROJECT_ID, reportId),
);

export const createReport = createAsyncThunk(
  'reports/create',
  ({ payload, projectId }: { payload: CreateReportPayload; projectId?: string }) =>
    reportsApi.createReport(projectId ?? PROJECT_ID, payload),
);

export const deleteReport = createAsyncThunk(
  'reports/delete',
  async ({ reportId, projectId }: { reportId: string; projectId?: string }) => {
    await reportsApi.deleteReport(projectId ?? PROJECT_ID, reportId);
    return reportId;
  },
);

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    clearActiveReport: (state) => { state.activeReport = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReports.pending,   (state) => { state.status.list = 'loading'; })
      .addCase(fetchReports.fulfilled, (state, action) => {
        state.status.list = 'succeeded';
        state.reports = action.payload;
      })
      .addCase(fetchReports.rejected,  (state) => { state.status.list = 'failed'; })

      .addCase(fetchReport.pending,    (state) => { state.status.active = 'loading'; })
      .addCase(fetchReport.fulfilled,  (state, action) => {
        state.status.active = 'succeeded';
        state.activeReport = action.payload;
      })
      .addCase(fetchReport.rejected,   (state) => { state.status.active = 'failed'; })

      .addCase(createReport.pending,   (state) => { state.status.creating = 'loading'; })
      .addCase(createReport.fulfilled, (state) => { state.status.creating = 'idle'; })
      .addCase(createReport.rejected,  (state) => { state.status.creating = 'failed'; })

      .addCase(deleteReport.fulfilled, (state, action) => {
        state.reports = state.reports.filter(r => r.report_id !== action.payload);
        if (state.activeReport?.report_id === action.payload) state.activeReport = null;
      });
  },
});

export const { clearActiveReport } = reportsSlice.actions;
export default reportsSlice.reducer;
