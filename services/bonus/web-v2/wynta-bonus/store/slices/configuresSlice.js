import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export const fetchConfigure = createAsyncThunk('configures/fetchOne', (id) => api.fetchConfigure(id));
export const createConfigure = createAsyncThunk('configures/create', ({ parentId, payload }) => api.createConfigure(parentId, payload));
export const updateConfigure = createAsyncThunk('configures/update', ({ id, patch }) => api.updateConfigure(id, patch));
export const createPromoCode = createAsyncThunk('configures/createPromoCode', ({ configureId, payload }) => api.createPromoCode(configureId, payload));
export const createTrigger = createAsyncThunk('configures/createTrigger', ({ configureId, payload }) => api.createTrigger(configureId, payload));
export const createEligibility = createAsyncThunk('configures/createEligibility', ({ configureId, payload }) => api.createEligibility(configureId, payload));

const configuresSlice = createSlice({
  name: 'configures',
  initialState: { ids: [], entities: {}, status: 'idle', error: null },
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchConfigure.fulfilled, (state, action) => {
        const c = action.payload;
        if (!state.ids.includes(c.id)) state.ids.push(c.id);
        state.entities[c.id] = c;
        state.status = 'succeeded';
      })
      .addCase(fetchConfigure.rejected, (state, action) => { state.status = 'failed'; state.error = action.error.message; })
      .addCase(createConfigure.fulfilled, (state, action) => {
        const c = action.payload;
        if (!state.ids.includes(c.id)) state.ids.push(c.id);
        state.entities[c.id] = c;
      })
      .addCase(updateConfigure.fulfilled, (state, action) => {
        const c = action.payload;
        state.entities[c.id] = c;
      })
      .addCase(createPromoCode.fulfilled, (state, action) => {
        const code = action.payload;
        const cfg = state.entities[code.configure_id];
        if (cfg) cfg.promo_codes = [...(cfg.promo_codes || []), code];
      })
      .addCase(createTrigger.fulfilled, (state, action) => {
        const t = action.payload;
        const cfg = state.entities[t.configure_id];
        if (cfg) cfg.triggers = [...(cfg.triggers || []), t];
      })
      .addCase(createEligibility.fulfilled, (state, action) => {
        const e = action.payload;
        const cfg = state.entities[e.configure_id];
        if (cfg) cfg.eligibilities = [...(cfg.eligibilities || []), e];
      });
  },
});

export const selectConfigureById = (id) => (state) => state.configures.entities[id];
export default configuresSlice.reducer;
