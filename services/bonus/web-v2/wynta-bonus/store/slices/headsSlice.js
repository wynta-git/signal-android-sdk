import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export const fetchHeads = createAsyncThunk('heads/fetchAll', (siteId) => api.fetchHeads(siteId));
export const fetchHead  = createAsyncThunk('heads/fetchOne', (id) => api.fetchHead(id));
export const createHead = createAsyncThunk('heads/create',   (payload) => api.createHead(payload));
export const updateHead = createAsyncThunk('heads/update',   ({ id, patch }) => api.updateHead(id, patch));

const _normalize = (h) => ({ subheads: [], owners: [], budget: [], ...h });

const headsSlice = createSlice({
  name: 'heads',
  initialState: { ids: [], entities: {}, status: 'idle', error: null },
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
      .addCase(fetchHeads.rejected, (state, action) => { state.status = 'failed'; state.error = action.error.message; })
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

export const selectAllHeads  = (state) => state.heads.ids.map(id => state.heads.entities[id]).filter(Boolean);
export const selectHeadById  = (id) => (state) => state.heads.entities[id];
export const selectHeadsStatus = (state) => state.heads.status;
export default headsSlice.reducer;
