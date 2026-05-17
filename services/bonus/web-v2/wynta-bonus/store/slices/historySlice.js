import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export const fetchHistory = createAsyncThunk('history/fetch', ({ type, id }) =>
  api.fetchHistory(type, id).then(events => ({ type, id, events }))
);

const historySlice = createSlice({
  name: 'history',
  initialState: { head: {}, subhead: {}, configure: {} },
  reducers: {},
  extraReducers(builder) {
    builder.addCase(fetchHistory.fulfilled, (state, action) => {
      const { type, id, events } = action.payload;
      state[type][id] = events;
    });
  },
});

export const selectHistory = (type, id) => (state) => state.history[type]?.[id];
export default historySlice.reducer;
