import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { createHead, updateHead } from './headsSlice';
import { createSubhead, updateSubhead } from './subheadsSlice';
import { createConfigure, updateConfigure } from './configuresSlice';

export const fetchKpiSnapshot = createAsyncThunk('kpi/fetch', async () => {
  const { MOCK_CONFIGURES } = await import('@/services/mocks/configures');
  const { CONFIGURE_USAGE } = await import('@/services/mocks/lifecycle');
  const { LIFECYCLE_STATES } = await import('@/services/mocks/lifecycle');

  const cfgs = Object.values(MOCK_CONFIGURES);
  let releasedToday = 0, redeemedToday = 0, expiredToday = 0;
  let topConfigure = null, topAmount = 0;

  for (const cfg of cfgs) {
    const usage = CONFIGURE_USAGE[cfg.id];
    if (!usage) continue;
    const released = parseFloat(usage.states?.RELEASED?.amount) || 0;
    const redeemed = parseFloat(usage.states?.CONSUMED?.amount) || 0;
    const expired = parseFloat(usage.states?.EXPIRED?.amount) || 0;
    releasedToday += released;
    redeemedToday += redeemed;
    expiredToday += expired;
    if (released > topAmount) { topAmount = released; topConfigure = cfg.name || `Configure ${cfg.id}`; }
  }

  return {
    releasedToday,
    redeemedToday,
    expiredToday,
    topConfigure: topConfigure || '—',
    activeBonuses: cfgs.filter(c => c.state === 'ACTIVE').length,
  };
});

const kpiSlice = createSlice({
  name: 'kpi',
  initialState: {
    releasedToday: 0,
    redeemedToday: 0,
    expiredToday: 0,
    topConfigure: '—',
    activeBonuses: 0,
    status: 'idle',
  },
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchKpiSnapshot.fulfilled, (state, action) => {
        Object.assign(state, action.payload, { status: 'succeeded' });
      })
      .addMatcher(
        (action) => [
          createHead.fulfilled.type, updateHead.fulfilled.type,
          createSubhead.fulfilled.type, updateSubhead.fulfilled.type,
          createConfigure.fulfilled.type, updateConfigure.fulfilled.type,
        ].includes(action.type),
        (state) => { state.status = 'idle'; }
      );
  },
});

export default kpiSlice.reducer;
