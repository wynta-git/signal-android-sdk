import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import { updateBudget } from './budgetsSlice';
import { updateOwners } from './ownersSlice';
import type { BonusSubhead, NormalizedState } from '../../types';

type SubheadsState = NormalizedState<BonusSubhead>;

const initialState: SubheadsState = { ids: [], entities: {}, status: 'idle', error: null };

const _normalize = (s: BonusSubhead): BonusSubhead => ({
  ...s,
  parent_head_id: s.parent_head_id ?? s.head_id,
  owners: s.owners ?? [],
  budget: s.budget ?? [],
  configures: s.configures ?? [],
});

export const fetchSubhead    = createAsyncThunk<BonusSubhead, number>('subheads/fetchOne', (id) => api.fetchSubhead(id));
export const createSubhead   = createAsyncThunk<BonusSubhead, { parentId: number; payload: Record<string, unknown> }>('subheads/create', ({ parentId, payload }) => api.createSubhead(parentId, payload));
export const updateSubhead   = createAsyncThunk<BonusSubhead, { id: number; patch: Partial<BonusSubhead> }>('subheads/update', ({ id, patch }) => api.updateSubhead(id, patch as Record<string, unknown>));
export const createManualBonus = createAsyncThunk<unknown, { subheadId: number; payload: Record<string, unknown> }>('subheads/createManualBonus', ({ subheadId, payload }) => api.createManualBonus(subheadId, payload));
export const issueCodeBonus  = createAsyncThunk<unknown, Record<string, unknown>>('subheads/issueCodeBonus', (payload) => api.issueCodeBonus(payload));

const subheadsSlice = createSlice({
  name: 'subheads',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchSubhead.pending, (state) => { if (state.status === 'idle') state.status = 'loading'; })
      .addCase(fetchSubhead.fulfilled, (state, action) => {
        const s = _normalize(action.payload);
        if (!state.ids.includes(s.id)) state.ids.push(s.id);
        state.entities[s.id] = s;
        state.status = 'succeeded';
      })
      .addCase(fetchSubhead.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? null;
      })
      .addCase(createSubhead.fulfilled, (state, action) => {
        const s = _normalize(action.payload);
        if (!state.ids.includes(s.id)) state.ids.push(s.id);
        state.entities[s.id] = s;
      })
      .addCase(updateSubhead.fulfilled, (state, action) => {
        const id = action.payload.id;
        const existing = state.entities[id];
        // PATCH response is BonusSubheadResponse — no budget/owners/configures.
        // Merge scalar fields; keep the rich fields already in the store.
        state.entities[id] = {
          ...existing,
          ...action.payload,
          parent_head_id: existing?.parent_head_id ?? action.payload.head_id,
          budget: existing?.budget ?? [],
          owners: existing?.owners ?? [],
          configures: existing?.configures ?? [],
        };
      })
      .addCase(updateBudget.fulfilled, (state, action) => {
        const [scope, idStr] = action.payload.key.split(':');
        if (scope === 'subhead') {
          const id = Number(idStr);
          if (state.entities[id]) {
            state.entities[id] = { ...state.entities[id]!, budget: action.payload.periods };
          }
        }
      })
      .addCase(updateOwners.fulfilled, (state, action) => {
        const [scope, idStr] = action.payload.key.split(':');
        if (scope === 'subhead') {
          const id = Number(idStr);
          if (state.entities[id]) {
            state.entities[id] = { ...state.entities[id]!, owners: action.payload.owners };
          }
        }
      });
  },
});

export const selectSubheadById = (id: number) => (state: { subheads: SubheadsState }) => state.subheads.entities[id];
export default subheadsSlice.reducer;
