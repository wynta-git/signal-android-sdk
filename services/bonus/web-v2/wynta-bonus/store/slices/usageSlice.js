import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export const fetchConfigureUsage = createAsyncThunk('usage/fetchConfigure', (id) =>
  api.fetchConfigureUsage(id).then(usage => ({ id, usage }))
);
export const fetchCodeUsage = createAsyncThunk('usage/fetchCode', (codeId) =>
  api.fetchCodeUsage(codeId).then(usage => ({ id: codeId, usage }))
);

const usageSlice = createSlice({
  name: 'usage',
  initialState: { configure: {}, code: {} },
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchConfigureUsage.fulfilled, (state, action) => {
        state.configure[action.payload.id] = action.payload.usage;
      })
      .addCase(fetchCodeUsage.fulfilled, (state, action) => {
        state.code[action.payload.id] = action.payload.usage;
      });
  },
});

export const selectConfigureUsage = (id) => (state) => state.usage.configure[id];
export const selectCodeUsage = (id) => (state) => state.usage.code[id];
export default usageSlice.reducer;
