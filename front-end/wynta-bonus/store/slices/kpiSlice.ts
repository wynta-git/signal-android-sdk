import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { KpiSnapshot, AsyncStatus } from '../../types';
import { createHead, updateHead } from './headsSlice';
import { createSubhead, updateSubhead } from './subheadsSlice';
import { createConfigure, updateConfigure, createPromoCode, updatePromoCode } from './configuresSlice';

type KpiState = KpiSnapshot & { status: AsyncStatus };

const initialState: KpiState = {
  active_heads:      0,
  active_subheads:   0,
  active_configures: 0,
  active_codes:      0,
  monthly_granted:   0,
  monthly_released:  0,
  monthly_consumed:  0,
  monthly_pending:   0,
  monthly_forfeit:   0,
  monthly_expiring:  0,
  monthly_limit:     0,
  monthly_pct:       0,
  status: 'idle',
};

export const fetchKpiSnapshot = createAsyncThunk<KpiSnapshot, string | number>(
  'kpi/fetch',
  (siteId) => api.fetchKpiSnapshot(siteId)
);

const kpiSlice = createSlice({
  name: 'kpi',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchKpiSnapshot.pending,   (state) => { state.status = 'loading'; })
      .addCase(fetchKpiSnapshot.fulfilled, (state, action) => {
        Object.assign(state, action.payload, { status: 'succeeded' });
      })
      .addCase(fetchKpiSnapshot.rejected,  (state) => { state.status = 'failed'; })
      .addMatcher(
        (action) => [
          createHead.fulfilled.type, updateHead.fulfilled.type,
          createSubhead.fulfilled.type, updateSubhead.fulfilled.type,
          createConfigure.fulfilled.type, updateConfigure.fulfilled.type,
          createPromoCode.fulfilled.type, updatePromoCode.fulfilled.type,
        ].includes(action.type),
        (state) => { state.status = 'idle'; }
      );
  },
});

export default kpiSlice.reducer;
