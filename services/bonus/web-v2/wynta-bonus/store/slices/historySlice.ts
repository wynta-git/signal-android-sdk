import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';
import type { HistoryEvent, NodeType } from '@/types';

interface HistoryState {
  head: Record<number, HistoryEvent[]>;
  subhead: Record<number, HistoryEvent[]>;
  configure: Record<number, HistoryEvent[]>;
}

interface FetchHistoryArg {
  type: NodeType;
  id: number;
}

interface FetchHistoryResult {
  type: NodeType;
  id: number;
  events: HistoryEvent[];
}

const initialState: HistoryState = { head: {}, subhead: {}, configure: {} };

export const fetchHistory = createAsyncThunk<FetchHistoryResult, FetchHistoryArg>(
  'history/fetch',
  ({ type, id }) => api.fetchHistory(type, id).then((events) => ({ type, id, events: events as unknown as HistoryEvent[] }))
);

const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder.addCase(fetchHistory.fulfilled, (state, action) => {
      const { type, id, events } = action.payload;
      state[type][id] = events;
    });
  },
});

export const selectHistory = (type: NodeType, id: number) => (state: { history: HistoryState }) => state.history[type]?.[id];
export default historySlice.reducer;
