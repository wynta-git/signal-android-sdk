import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { apiGet, apiPost, apiPatch, apiPut } from '@/store/api/client'
import type {
  BonusSubheadDetail, BonusSubheadResponse, BonusSubheadCreate, BonusSubheadUpdate,
  OwnersUpsertRequest, LimitsUpsertRequest, OwnerEntry, BudgetEntry,
} from '@/lib/types'
import type { RootState } from '@/store/index'

// ── State ─────────────────────────────────────────────────────────────────────

interface SubheadState {
  entities: Record<number, BonusSubheadDetail>
  // loading keys: "fetch_{id}" | "create" | "update_{id}" | "owners_{id}" | "limits_{id}"
  loading: Record<string, boolean>
  errors:  Record<string, string | null>
  lastCreated: BonusSubheadResponse | null
}

const initialState: SubheadState = {
  entities: {},
  loading: {},
  errors: {},
  lastCreated: null,
}

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchSubhead = createAsyncThunk(
  'subheads/fetchSubhead',
  async (id: number, { rejectWithValue }) => {
    try {
      return await apiGet<BonusSubheadDetail>(`/bonus-subheads/${id}`)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load subhead')
    }
  }
)

export const createSubhead = createAsyncThunk(
  'subheads/createSubhead',
  async (body: BonusSubheadCreate, { rejectWithValue }) => {
    try {
      return await apiPost<BonusSubheadResponse>('/bonus-subheads', body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to create subhead')
    }
  }
)

export const updateSubhead = createAsyncThunk(
  'subheads/updateSubhead',
  async ({ id, body }: { id: number; body: BonusSubheadUpdate }, { rejectWithValue }) => {
    try {
      return await apiPatch<BonusSubheadResponse>(`/bonus-subheads/${id}`, body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update subhead')
    }
  }
)

export const upsertSubheadOwners = createAsyncThunk(
  'subheads/upsertSubheadOwners',
  async ({ id, body }: { id: number; body: OwnersUpsertRequest }, { rejectWithValue }) => {
    try {
      const owners = await apiPut<OwnerEntry[]>(`/bonus-subheads/${id}/owners`, body)
      return { id, owners }
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update owners')
    }
  }
)

export const upsertSubheadLimits = createAsyncThunk(
  'subheads/upsertSubheadLimits',
  async ({ id, body }: { id: number; body: LimitsUpsertRequest }, { rejectWithValue }) => {
    try {
      const budget = await apiPut<BudgetEntry[]>(`/bonus-subheads/${id}/limits`, body)
      return { id, budget }
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update limits')
    }
  }
)

// ── Slice ─────────────────────────────────────────────────────────────────────

const subheadSlice = createSlice({
  name: 'subheads',
  initialState,
  reducers: {
    clearSubheadError: (state, action: { payload: string }) => {
      state.errors[action.payload] = null
    },
  },
  extraReducers: (builder) => {
    // fetchSubhead
    builder
      .addCase(fetchSubhead.pending, (state, { meta }) => {
        state.loading[`fetch_${meta.arg}`] = true
        state.errors[`fetch_${meta.arg}`] = null
      })
      .addCase(fetchSubhead.fulfilled, (state, { meta, payload }) => {
        state.loading[`fetch_${meta.arg}`] = false
        state.entities[payload.id] = payload
      })
      .addCase(fetchSubhead.rejected, (state, { meta, payload }) => {
        state.loading[`fetch_${meta.arg}`] = false
        state.errors[`fetch_${meta.arg}`] = payload as string
      })

    // createSubhead
    builder
      .addCase(createSubhead.pending, (state) => {
        state.loading['create'] = true
        state.errors['create'] = null
      })
      .addCase(createSubhead.fulfilled, (state, { payload }) => {
        state.loading['create'] = false
        state.lastCreated = payload
        state.entities[payload.id] = { ...payload, owners: [], budget: [] }
      })
      .addCase(createSubhead.rejected, (state, { payload }) => {
        state.loading['create'] = false
        state.errors['create'] = payload as string
      })

    // updateSubhead
    builder
      .addCase(updateSubhead.pending, (state, { meta }) => {
        state.loading[`update_${meta.arg.id}`] = true
        state.errors[`update_${meta.arg.id}`] = null
      })
      .addCase(updateSubhead.fulfilled, (state, { meta, payload }) => {
        state.loading[`update_${meta.arg.id}`] = false
        const existing = state.entities[meta.arg.id]
        if (existing) state.entities[meta.arg.id] = { ...existing, ...payload }
      })
      .addCase(updateSubhead.rejected, (state, { meta, payload }) => {
        state.loading[`update_${meta.arg.id}`] = false
        state.errors[`update_${meta.arg.id}`] = payload as string
      })

    // upsertSubheadOwners
    builder
      .addCase(upsertSubheadOwners.pending, (state, { meta }) => {
        state.loading[`owners_${meta.arg.id}`] = true
        state.errors[`owners_${meta.arg.id}`] = null
      })
      .addCase(upsertSubheadOwners.fulfilled, (state, { payload }) => {
        state.loading[`owners_${payload.id}`] = false
        if (state.entities[payload.id]) state.entities[payload.id].owners = payload.owners
      })
      .addCase(upsertSubheadOwners.rejected, (state, { meta, payload }) => {
        state.loading[`owners_${meta.arg.id}`] = false
        state.errors[`owners_${meta.arg.id}`] = payload as string
      })

    // upsertSubheadLimits
    builder
      .addCase(upsertSubheadLimits.pending, (state, { meta }) => {
        state.loading[`limits_${meta.arg.id}`] = true
        state.errors[`limits_${meta.arg.id}`] = null
      })
      .addCase(upsertSubheadLimits.fulfilled, (state, { payload }) => {
        state.loading[`limits_${payload.id}`] = false
        if (state.entities[payload.id]) state.entities[payload.id].budget = payload.budget
      })
      .addCase(upsertSubheadLimits.rejected, (state, { meta, payload }) => {
        state.loading[`limits_${meta.arg.id}`] = false
        state.errors[`limits_${meta.arg.id}`] = payload as string
      })
  },
})

export const { clearSubheadError } = subheadSlice.actions
export default subheadSlice.reducer

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectSubhead        = (id: number) => (s: RootState) => s.subheads.entities[id]
export const selectSubheadLoading = (key: string) => (s: RootState) => !!s.subheads.loading[key]
export const selectSubheadError   = (key: string) => (s: RootState) => s.subheads.errors[key] ?? null
export const selectLastCreatedSubhead = (s: RootState) => s.subheads.lastCreated
