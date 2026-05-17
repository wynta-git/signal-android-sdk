import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export const fetchSubhead = createAsyncThunk('subheads/fetchOne', (id) => api.fetchSubhead(id));
export const createSubhead = createAsyncThunk('subheads/create', ({ parentId, payload }) => api.createSubhead(parentId, payload));
export const updateSubhead = createAsyncThunk('subheads/update', ({ id, patch }) => api.updateSubhead(id, patch));
export const createManualBonus = createAsyncThunk('subheads/createManualBonus', ({ subheadId, payload }) => api.createManualBonus(subheadId, payload));
export const issueCodeBonus = createAsyncThunk('subheads/issueCodeBonus', (payload) => api.issueCodeBonus(payload));

const subheadsSlice = createSlice({
  name: 'subheads',
  initialState: { ids: [], entities: {}, status: 'idle', error: null },
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
      .addCase(fetchSubhead.rejected, (state, action) => { state.status = 'failed'; state.error = action.error.message; })
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

export const selectSubheadById = (id) => (state) => state.subheads.entities[id];
export default subheadsSlice.reducer;
