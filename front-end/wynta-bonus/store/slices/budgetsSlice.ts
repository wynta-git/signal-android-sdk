import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { BudgetPeriod, AsyncStatus } from '../../types';

interface BudgetsState {
  data: Record<string, BudgetPeriod[]>;
  status: Record<string, AsyncStatus>;
}

interface FetchBudgetArg {
  scope: string;
  id: number;
}

interface FetchBudgetResult {
  key: string;
  periods: BudgetPeriod[];
  inherited: boolean;
}

interface UpdateBudgetArg {
  scope: string;
  id: number;
  periods: BudgetPeriod[];
}

interface UpdateBudgetResult {
  key: string;
  periods: BudgetPeriod[];
}

const initialState: BudgetsState = { data: {}, status: {} };

export const fetchBudget = createAsyncThunk<FetchBudgetResult, FetchBudgetArg>(
  'budgets/fetch',
  ({ scope, id }) =>
    api.fetchBudget(scope, id).then((periods: BudgetPeriod[]) => ({ key: `${scope}:${id}`, periods, inherited: false }))
);

export const updateBudget = createAsyncThunk<UpdateBudgetResult, UpdateBudgetArg>(
  'budgets/update',
  ({ scope, id, periods }) =>
    api.updateBudget(scope, id, periods).then((p) => ({ key: `${scope}:${id}`, periods: p }))
);

const budgetsSlice = createSlice({
  name: 'budgets',
  initialState,
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

export const selectBudget = (scope: string, id: number) => (state: { budgets: BudgetsState }) => state.budgets.data[`${scope}:${id}`];
export default budgetsSlice.reducer;
