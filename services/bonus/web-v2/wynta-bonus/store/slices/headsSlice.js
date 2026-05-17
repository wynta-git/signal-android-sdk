import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export const fetchHeads = createAsyncThunk('heads/fetchAll', () => api.fetchHeads());
export const fetchHead = createAsyncThunk('heads/fetchOne', (id) => api.fetchHead(id));
export const createHead = createAsyncThunk('heads/create', (payload) => api.createHead(payload));
export const updateHead = createAsyncThunk('heads/update', ({ id, patch }) => api.updateHead(id, patch));

const headsSlice = createSlice({
  name: 'heads',
  initialState: { ids: [], entities: {}, status: 'idle', error: null },
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchHeads.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchHeads.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.ids = action.payload.map(h => h.id);
        state.entities = Object.fromEntries(action.payload.map(h => [h.id, h]));
      })
      .addCase(fetchHeads.rejected, (state, action) => { state.status = 'failed'; state.error = action.error.message; })
      .addCase(fetchHead.fulfilled, (state, action) => {
        const h = action.payload;
        if (!state.ids.includes(h.id)) state.ids.push(h.id);
        state.entities[h.id] = h;
      })
      .addCase(createHead.fulfilled, (state, action) => {
        const h = action.payload;
        if (!state.ids.includes(h.id)) state.ids.push(h.id);
        state.entities[h.id] = h;
      })
      .addCase(updateHead.fulfilled, (state, action) => {
        const h = action.payload;
        state.entities[h.id] = h;
      });
  },
});

export const selectAllHeads = (state) => state.heads.ids.map(id => state.heads.entities[id]);
export const selectHeadById = (id) => (state) => state.heads.entities[id];
export default headsSlice.reducer;
