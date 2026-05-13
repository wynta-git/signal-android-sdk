import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { apiGet, apiPost, apiPatch, apiPut } from '@/store/api/client'
import type {
  BonusHeadDetail, BonusHeadResponse, BonusHeadCreate, BonusHeadUpdate,
  OwnersUpsertRequest, LimitsUpsertRequest, OwnerEntry, BudgetEntry,
} from '@/lib/types'
import type { RootState } from '@/store/index'

// ── State ─────────────────────────────────────────────────────────────────────

interface HeadState {
  entities: Record<number, BonusHeadDetail>
  // loading keys: "fetch_{id}" | "create" | "update_{id}" | "owners_{id}" | "limits_{id}"
  loading: Record<string, boolean>
  errors:  Record<string, string | null>
  lastCreated: BonusHeadResponse | null
}

const initialState: HeadState = {
  entities: {},
  loading: {},
  errors: {},
  lastCreated: null,
}

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchHead = createAsyncThunk(
  'heads/fetchHead',
  async (id: number, { rejectWithValue }) => {
    try {
      return await apiGet<BonusHeadDetail>(`/bonus-heads/${id}`)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load head')
    }
  }
)

export const createHead = createAsyncThunk(
  'heads/createHead',
  async (body: BonusHeadCreate, { rejectWithValue }) => {
    try {
      return await apiPost<BonusHeadResponse>('/bonus-heads', body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to create head')
    }
  }
)

export const updateHead = createAsyncThunk(
  'heads/updateHead',
  async ({ id, body }: { id: number; body: BonusHeadUpdate }, { rejectWithValue }) => {
    try {
      return await apiPatch<BonusHeadResponse>(`/bonus-heads/${id}`, body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update head')
    }
  }
)

export const upsertHeadOwners = createAsyncThunk(
  'heads/upsertHeadOwners',
  async ({ id, body }: { id: number; body: OwnersUpsertRequest }, { rejectWithValue }) => {
    try {
      const owners = await apiPut<OwnerEntry[]>(`/bonus-heads/${id}/owners`, body)
      return { id, owners }
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update owners')
    }
  }
)

export const upsertHeadLimits = createAsyncThunk(
  'heads/upsertHeadLimits',
  async ({ id, body }: { id: number; body: LimitsUpsertRequest }, { rejectWithValue }) => {
    try {
      const budget = await apiPut<BudgetEntry[]>(`/bonus-heads/${id}/limits`, body)
      return { id, budget }
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update limits')
    }
  }
)

// ── Slice ─────────────────────────────────────────────────────────────────────

const headSlice = createSlice({
  name: 'heads',
  initialState,
  reducers: {
    clearHeadError: (state, action: { payload: string }) => {
      state.errors[action.payload] = null
    },
  },
  extraReducers: (builder) => {
    // fetchHead
    builder
      .addCase(fetchHead.pending, (state, { meta }) => {
        state.loading[`fetch_${meta.arg}`] = true
        state.errors[`fetch_${meta.arg}`] = null
      })
      .addCase(fetchHead.fulfilled, (state, { meta, payload }) => {
        state.loading[`fetch_${meta.arg}`] = false
        state.entities[payload.id] = payload
      })
      .addCase(fetchHead.rejected, (state, { meta, payload }) => {
        state.loading[`fetch_${meta.arg}`] = false
        state.errors[`fetch_${meta.arg}`] = payload as string
      })

    // createHead
    builder
      .addCase(createHead.pending, (state) => {
        state.loading['create'] = true
        state.errors['create'] = null
      })
      .addCase(createHead.fulfilled, (state, { payload }) => {
        state.loading['create'] = false
        state.lastCreated = payload
        // Store as a partial detail so the entity exists for navigation
        state.entities[payload.id] = { ...payload, owners: [], subheads: [], budget: [] }
      })
      .addCase(createHead.rejected, (state, { payload }) => {
        state.loading['create'] = false
        state.errors['create'] = payload as string
      })

    // updateHead
    builder
      .addCase(updateHead.pending, (state, { meta }) => {
        state.loading[`update_${meta.arg.id}`] = true
        state.errors[`update_${meta.arg.id}`] = null
      })
      .addCase(updateHead.fulfilled, (state, { meta, payload }) => {
        state.loading[`update_${meta.arg.id}`] = false
        // Merge updated fields, preserve owners/subheads/budget
        const existing = state.entities[meta.arg.id]
        if (existing) {
          state.entities[meta.arg.id] = { ...existing, ...payload }
        }
      })
      .addCase(updateHead.rejected, (state, { meta, payload }) => {
        state.loading[`update_${meta.arg.id}`] = false
        state.errors[`update_${meta.arg.id}`] = payload as string
      })

    // upsertHeadOwners
    builder
      .addCase(upsertHeadOwners.pending, (state, { meta }) => {
        state.loading[`owners_${meta.arg.id}`] = true
        state.errors[`owners_${meta.arg.id}`] = null
      })
      .addCase(upsertHeadOwners.fulfilled, (state, { payload }) => {
        state.loading[`owners_${payload.id}`] = false
        if (state.entities[payload.id]) {
          state.entities[payload.id].owners = payload.owners
        }
      })
      .addCase(upsertHeadOwners.rejected, (state, { meta, payload }) => {
        state.loading[`owners_${meta.arg.id}`] = false
        state.errors[`owners_${meta.arg.id}`] = payload as string
      })

    // upsertHeadLimits
    builder
      .addCase(upsertHeadLimits.pending, (state, { meta }) => {
        state.loading[`limits_${meta.arg.id}`] = true
        state.errors[`limits_${meta.arg.id}`] = null
      })
      .addCase(upsertHeadLimits.fulfilled, (state, { payload }) => {
        state.loading[`limits_${payload.id}`] = false
        if (state.entities[payload.id]) {
          state.entities[payload.id].budget = payload.budget
        }
      })
      .addCase(upsertHeadLimits.rejected, (state, { meta, payload }) => {
        state.loading[`limits_${meta.arg.id}`] = false
        state.errors[`limits_${meta.arg.id}`] = payload as string
      })
  },
})

export const { clearHeadError } = headSlice.actions
export default headSlice.reducer

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectHead        = (id: number) => (s: RootState) => s.heads.entities[id]
export const selectHeadLoading = (key: string) => (s: RootState) => !!s.heads.loading[key]
export const selectHeadError   = (key: string) => (s: RootState) => s.heads.errors[key] ?? null
export const selectLastCreatedHead = (s: RootState) => s.heads.lastCreated
