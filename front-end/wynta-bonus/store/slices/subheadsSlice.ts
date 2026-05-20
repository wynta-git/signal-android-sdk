import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { BonusSubhead, NormalizedState } from '../../types';

type SubheadsState = NormalizedState<BonusSubhead>;

const initialState: SubheadsState = { ids: [], entities: {}, status: 'idle', error: null };

export const fetchSubhead    = createAsyncThunk<BonusSubhead, number>('subheads/fetchOne', (id) => api.fetchSubhead(id));
export const createSubhead   = createAsyncThunk<BonusSubhead, { parentId: number; payload: Record<string, unknown> }>('subheads/create', ({ parentId, payload }) => api.createSubhead(parentId, payload));
export const updateSubhead   = createAsyncThunk<BonusSubhead, { id: number; patch: Partial<BonusSubhead> }>('subheads/update', ({ id, patch }) => api.updateSubhead(id, patch));
export const createManualBonus = createAsyncThunk<unknown, { subheadId: number; payload: Record<string, unknown> }>('subheads/createManualBonus', ({ subheadId, payload }) => api.createManualBonus(subheadId, payload));
export const issueCodeBonus  = createAsyncThunk<unknown, Record<string, unknown>>('subheads/issueCodeBonus', (payload) => api.issueCodeBonus(payload));

const subheadsSlice = createSlice({
  name: 'subheads',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchSubhead.pending, (state) => { if (state.status === 'idle') state.status = 'loading'; })
      .addCase(fetchSubhead.fulfilled, (state, action) => {
        const s = action.payload;
        if (!state.ids.includes(s.id)) state.ids.push(s.id);
        state.entities[s.id] = s;
        state.status = 'succeeded';
      })
      .addCase(fetchSubhead.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? null;
      })
      .addCase(createSubhead.fulfilled, (state, action) => {
        const s = action.payload;
        if (!state.ids.includes(s.id)) state.ids.push(s.id);
        state.entities[s.id] = s;
      })
      .addCase(updateSubhead.fulfilled, (state, action) => {
        const s = action.payload;
        state.entities[s.id] = s;
      });
  },
});

export const selectSubheadById = (id: number) => (state: { subheads: SubheadsState }) => state.subheads.entities[id];
export default subheadsSlice.reducer;
