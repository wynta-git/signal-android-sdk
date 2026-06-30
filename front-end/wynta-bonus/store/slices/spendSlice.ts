import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { SpendPeriod } from '../../types';

interface SpendState {
  data: Record<string, SpendPeriod[]>;  // key: "{ENTITY_TYPE}_{id}"
}

export const fetchEntitySpend = createAsyncThunk<
  { key: string; rows: SpendPeriod[] },
  { entityType: string; entityId: number }
>(
  'spend/fetch',
  ({ entityType, entityId }) =>
    api.fetchBonusSpend(entityType, entityId)
       .then(rows => ({ key: `${entityType}_${entityId}`, rows })),
);

const spendSlice = createSlice({
  name: 'spend',
  initialState: { data: {} } as SpendState,
  reducers: {},
  extraReducers(builder) {
    builder.addCase(fetchEntitySpend.fulfilled, (state, action) => {
      state.data[action.payload.key] = action.payload.rows;
    });
  },
});

export const selectEntitySpend =
  (entityType: string, entityId: number) =>
  (state: { spend: SpendState }): SpendPeriod[] =>
    state.spend.data[`${entityType}_${entityId}`] ?? [];

export default spendSlice.reducer;
