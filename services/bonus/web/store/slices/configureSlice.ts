import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { apiGet, apiPost, apiPatch } from '@/store/api/client'
import type {
  BonusConfigureDetail, BonusConfigureResponse,
  BonusConfigureCreate, BonusConfigureUpdate,
} from '@/lib/types'
import type { RootState } from '@/store/index'

// ── State ─────────────────────────────────────────────────────────────────────

interface ConfigureState {
  entities: Record<number, BonusConfigureDetail>
  // loading keys: "fetch_{id}" | "create" | "update_{id}"
  loading: Record<string, boolean>
  errors:  Record<string, string | null>
  lastCreated: BonusConfigureResponse | null
}

const initialState: ConfigureState = {
  entities: {},
  loading: {},
  errors: {},
  lastCreated: null,
}

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchConfigure = createAsyncThunk(
  'configures/fetchConfigure',
  async (id: number, { rejectWithValue }) => {
    try {
      return await apiGet<BonusConfigureDetail>(`/bonus-configures/${id}`)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load configure')
    }
  }
)

export const createConfigure = createAsyncThunk(
  'configures/createConfigure',
  async (body: BonusConfigureCreate, { rejectWithValue }) => {
    try {
      return await apiPost<BonusConfigureResponse>('/bonus-configures', body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to create configure')
    }
  }
)

export const updateConfigure = createAsyncThunk(
  'configures/updateConfigure',
  async ({ id, body }: { id: number; body: BonusConfigureUpdate }, { rejectWithValue }) => {
    try {
      return await apiPatch<BonusConfigureResponse>(`/bonus-configures/${id}`, body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update configure')
    }
  }
)

// ── Slice ─────────────────────────────────────────────────────────────────────

const configureSlice = createSlice({
  name: 'configures',
  initialState,
  reducers: {
    clearConfigureError: (state, action: { payload: string }) => {
      state.errors[action.payload] = null
    },
  },
  extraReducers: (builder) => {
    // fetchConfigure
    builder
      .addCase(fetchConfigure.pending, (state, { meta }) => {
        state.loading[`fetch_${meta.arg}`] = true
        state.errors[`fetch_${meta.arg}`] = null
      })
      .addCase(fetchConfigure.fulfilled, (state, { meta, payload }) => {
        state.loading[`fetch_${meta.arg}`] = false
        state.entities[payload.id] = payload
      })
      .addCase(fetchConfigure.rejected, (state, { meta, payload }) => {
        state.loading[`fetch_${meta.arg}`] = false
        state.errors[`fetch_${meta.arg}`] = payload as string
      })

    // createConfigure
    builder
      .addCase(createConfigure.pending, (state) => {
        state.loading['create'] = true
        state.errors['create'] = null
      })
      .addCase(createConfigure.fulfilled, (state, { payload }) => {
        state.loading['create'] = false
        state.lastCreated = payload
        state.entities[payload.id] = { ...payload, codes: [] }
      })
      .addCase(createConfigure.rejected, (state, { payload }) => {
        state.loading['create'] = false
        state.errors['create'] = payload as string
      })

    // updateConfigure
    builder
      .addCase(updateConfigure.pending, (state, { meta }) => {
        state.loading[`update_${meta.arg.id}`] = true
        state.errors[`update_${meta.arg.id}`] = null
      })
      .addCase(updateConfigure.fulfilled, (state, { meta, payload }) => {
        state.loading[`update_${meta.arg.id}`] = false
        const existing = state.entities[meta.arg.id]
        if (existing) state.entities[meta.arg.id] = { ...existing, ...payload }
      })
      .addCase(updateConfigure.rejected, (state, { meta, payload }) => {
        state.loading[`update_${meta.arg.id}`] = false
        state.errors[`update_${meta.arg.id}`] = payload as string
      })
  },
})

export const { clearConfigureError } = configureSlice.actions
export default configureSlice.reducer

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectConfigure        = (id: number) => (s: RootState) => s.configures.entities[id]
export const selectConfigureLoading = (key: string) => (s: RootState) => !!s.configures.loading[key]
export const selectConfigureError   = (key: string) => (s: RootState) => s.configures.errors[key] ?? null
export const selectLastCreatedConfigure = (s: RootState) => s.configures.lastCreated
