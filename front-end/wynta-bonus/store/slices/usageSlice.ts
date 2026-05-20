import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { UsageData } from '../../services/mocks/lifecycle';

interface UsageState {
  configure: Record<number, UsageData>;
  code: Record<string | number, UsageData>;
}

const initialState: UsageState = { configure: {}, code: {} };

export const fetchConfigureUsage = createAsyncThunk<{ id: number; usage: UsageData }, number>(
  'usage/fetchConfigure',
  (id) => api.fetchConfigureUsage(id).then((usage) => ({ id, usage: usage as unknown as UsageData }))
);

export const fetchCodeUsage = createAsyncThunk<{ id: string | number; usage: UsageData }, string | number>(
  'usage/fetchCode',
  (codeId) => api.fetchCodeUsage(codeId).then((usage) => ({ id: codeId, usage: usage as unknown as UsageData }))
);

const usageSlice = createSlice({
  name: 'usage',
  initialState,
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

export const selectConfigureUsage = (id: number) => (state: { usage: UsageState }) => state.usage.configure[id];
export const selectCodeUsage = (id: string | number) => (state: { usage: UsageState }) => state.usage.code[id];
export default usageSlice.reducer;
