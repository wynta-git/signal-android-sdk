import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { BonusConfigure, PromoCode, Trigger, EligibilityRule, NormalizedState } from '../../types';

type ConfiguresState = NormalizedState<BonusConfigure>;

const initialState: ConfiguresState = { ids: [], entities: {}, status: 'idle', error: null };

export const fetchConfigure          = createAsyncThunk<BonusConfigure, number>('configures/fetchOne', (id) => api.fetchConfigure(id));
export const fetchConfiguresBySubhead = createAsyncThunk<BonusConfigure[], number>('configures/fetchBySubhead', (subheadId) => api.fetchConfigures(subheadId));
export const createConfigure  = createAsyncThunk<BonusConfigure, { parentId: number; payload: Record<string, unknown> }>('configures/create', ({ parentId, payload }) => api.createConfigure(parentId, payload));
export const updateConfigure  = createAsyncThunk<BonusConfigure, { id: number; patch: Partial<BonusConfigure> }>('configures/update', ({ id, patch }) => api.updateConfigure(id, patch as Record<string, unknown>));
export const createPromoCode  = createAsyncThunk<PromoCode, { configureId: number; payload: Record<string, unknown> }>('configures/createPromoCode', ({ configureId, payload }) => api.createPromoCode(configureId, payload));
export const updatePromoCode  = createAsyncThunk<PromoCode, { codeId: number; patch: Record<string, unknown> }>('configures/updatePromoCode', ({ codeId, patch }) => api.updatePromoCode(codeId, patch));
export const createTrigger    = createAsyncThunk<Trigger, { configureId: number; payload: Record<string, unknown> }>('configures/createTrigger', ({ configureId, payload }) => api.createTrigger(configureId, payload));
export const createEligibility = createAsyncThunk<EligibilityRule, { configureId: number; payload: Record<string, unknown> }>('configures/createEligibility', ({ configureId, payload }) => api.createEligibility(configureId, payload));

const configuresSlice = createSlice({
  name: 'configures',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchConfigure.fulfilled, (state, action) => {
        const c = action.payload;
        if (!state.ids.includes(c.id)) state.ids.push(c.id);
        state.entities[c.id] = c;
        state.status = 'succeeded';
      })
      .addCase(fetchConfiguresBySubhead.fulfilled, (state, action) => {
        for (const c of action.payload) {
          if (!state.ids.includes(c.id)) state.ids.push(c.id);
          state.entities[c.id] = c;
        }
      })
      .addCase(fetchConfigure.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? null;
      })
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
      .addCase(updatePromoCode.fulfilled, (state, action) => {
        const code = action.payload;
        const cfg = state.entities[code.configure_id];
        if (cfg) cfg.promo_codes = (cfg.promo_codes || []).map(c => Number(c.id) === Number(code.id) ? code : c);
      })
      .addCase(createTrigger.fulfilled, (state, action) => {
        const t = action.payload;
        const cfg = t.configure_id !== undefined ? state.entities[t.configure_id] : undefined;
        if (cfg) cfg.triggers = [...(cfg.triggers || []), t];
      })
      .addCase(createEligibility.fulfilled, (state, action) => {
        const e = action.payload;
        const cfg = e.configure_id !== undefined ? state.entities[e.configure_id] : undefined;
        if (cfg) cfg.eligibilities = [...(cfg.eligibilities || []), e];
      });
  },
});

export const selectConfigureById = (id: number) => (state: { configures: ConfiguresState }) => state.configures.entities[id];
export const selectConfiguresBySubhead = (subheadId: number) => (state: { configures: ConfiguresState }) =>
  state.configures.ids.map(id => state.configures.entities[id]).filter(c => c?.subhead_id === subheadId) as BonusConfigure[];
export default configuresSlice.reducer;
