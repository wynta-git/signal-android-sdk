import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { api } from '@/services/api';
import type { BonusHead, NormalizedState } from '@/types';

type HeadsState = NormalizedState<BonusHead>;

const initialState: HeadsState = { ids: [], entities: {}, status: 'idle', error: null };

const _normalize = (h: BonusHead): BonusHead => ({
  ...h,
  subheads: h.subheads ?? [],
  owners: h.owners ?? [],
  budget: h.budget ?? [],
});

export const fetchHeads = createAsyncThunk<BonusHead[], string | number>('heads/fetchAll', (siteId) => api.fetchHeads(siteId));
export const fetchHead  = createAsyncThunk<BonusHead, number>('heads/fetchOne', (id) => api.fetchHead(id));
export const createHead = createAsyncThunk<BonusHead, Omit<BonusHead, 'id' | 'subheads' | 'owners' | 'budget'>>('heads/create', (payload) => api.createHead(payload));
export const updateHead = createAsyncThunk<BonusHead, { id: number; patch: Partial<BonusHead> }>('heads/update', ({ id, patch }) => api.updateHead(id, patch));

const headsSlice = createSlice({
  name: 'heads',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchHeads.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchHeads.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const incoming = action.payload.map(_normalize);
        const incomingIds = new Set(incoming.map(h => h.id));
        // Merge — preserve full detail already loaded for an id
        for (const h of incoming) {
          state.entities[h.id] = { ...h, ...state.entities[h.id] };
        }
        state.ids = incoming.map(h => h.id).filter(id => incomingIds.has(id));
      })
      .addCase(fetchHeads.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? null;
      })
      .addCase(fetchHead.fulfilled, (state, action) => {
        const h = _normalize(action.payload);
        state.entities[h.id] = { ...state.entities[h.id], ...h };
        if (!state.ids.includes(h.id)) state.ids.push(h.id);
      })
      .addCase(createHead.fulfilled, (state, action) => {
        const h = _normalize(action.payload);
        state.entities[h.id] = h;
        if (!state.ids.includes(h.id)) state.ids.push(h.id);
      })
      .addCase(updateHead.fulfilled, (state, action) => {
        const h = action.payload;
        state.entities[h.id] = { ...state.entities[h.id], ...h };
      });
  },
});

export const selectAllHeads = createSelector(
  (state: { heads: HeadsState }) => state.heads.ids,
  (state: { heads: HeadsState }) => state.heads.entities,
  (ids, entities) => ids.map(id => entities[id]).filter(Boolean) as BonusHead[]
);
export const selectHeadById    = (id: number) => (state: { heads: HeadsState }) => state.heads.entities[id];
export const selectHeadsStatus = (state: { heads: HeadsState }) => state.heads.status;
export default headsSlice.reducer;
