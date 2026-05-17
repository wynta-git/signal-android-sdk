import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export const fetchBudget = createAsyncThunk('budgets/fetch', ({ scope, id }) =>
  api.fetchBudget(scope, id).then(periods => ({ key: `${scope}:${id}`, periods, inherited: false }))
);
export const updateBudget = createAsyncThunk('budgets/update', ({ scope, id, periods }) =>
  api.updateBudget(scope, id, periods).then(p => ({ key: `${scope}:${id}`, periods: p }))
);

const budgetsSlice = createSlice({
  name: 'budgets',
  initialState: { data: {}, status: {} },
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchBudget.pending, (state, action) => {
        const { scope, id } = action.meta.arg;
        state.status[`${scope}:${id}`] = 'loading';
      })
      .addCase(fetchBudget.fulfilled, (state, action) => {
        state.data[action.payload.key] = action.payload.periods;
        state.status[action.payload.key] = 'succeeded';
      })
      .addCase(updateBudget.fulfilled, (state, action) => {
        state.data[action.payload.key] = action.payload.periods;
      });
  },
});

export const selectBudget = (scope, id) => (state) => state.budgets.data[`${scope}:${id}`];
export default budgetsSlice.reducer;
