import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { apiGet, apiPost, apiPatch } from '@/store/api/client'
import type {
  BonusEligibilityResponse,
  BonusEligibilityCreate,
  BonusEligibilityUpdate,
} from '@/lib/types'
import type { RootState } from '@/store/index'

interface EligibilityState {
  entities: Record<number, BonusEligibilityResponse>
  // Indexed by configure_id so we can list all for a configure
  byConfigure: Record<number, number[]>
  loading: Record<string, boolean>
  errors: Record<string, string | null>
}

const initialState: EligibilityState = {
  entities: {},
  byConfigure: {},
  loading: {},
  errors: {},
}

export const fetchEligibility = createAsyncThunk(
  'eligibilities/fetch',
  async (id: number, { rejectWithValue }) => {
    try {
      return await apiGet<BonusEligibilityResponse>(`/bonus-eligibilities/${id}`)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load eligibility')
    }
  }
)

export const createEligibility = createAsyncThunk(
  'eligibilities/create',
  async (body: BonusEligibilityCreate, { rejectWithValue }) => {
    try {
      return await apiPost<BonusEligibilityResponse>('/bonus-eligibilities', body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to create eligibility')
    }
  }
)

export const updateEligibility = createAsyncThunk(
  'eligibilities/update',
  async ({ id, body }: { id: number; body: BonusEligibilityUpdate }, { rejectWithValue }) => {
    try {
      return await apiPatch<BonusEligibilityResponse>(`/bonus-eligibilities/${id}`, body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update eligibility')
    }
  }
)

const eligibilitySlice = createSlice({
  name: 'eligibilities',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEligibility.fulfilled, (state, { payload }) => {
        state.entities[payload.id] = payload
        const list = state.byConfigure[payload.configure_id] ?? []
        if (!list.includes(payload.id)) {
          state.byConfigure[payload.configure_id] = [...list, payload.id]
        }
      })

      .addCase(createEligibility.pending, (state) => {
        state.loading['create'] = true
        state.errors['create'] = null
      })
      .addCase(createEligibility.fulfilled, (state, { payload }) => {
        state.loading['create'] = false
        state.entities[payload.id] = payload
        const list = state.byConfigure[payload.configure_id] ?? []
        if (!list.includes(payload.id)) {
          state.byConfigure[payload.configure_id] = [...list, payload.id]
        }
      })
      .addCase(createEligibility.rejected, (state, { payload }) => {
        state.loading['create'] = false
        state.errors['create'] = payload as string
      })

      .addCase(updateEligibility.pending, (state, { meta }) => {
        state.loading[`update_${meta.arg.id}`] = true
        state.errors[`update_${meta.arg.id}`] = null
      })
      .addCase(updateEligibility.fulfilled, (state, { payload }) => {
        state.loading[`update_${payload.id}`] = false
        state.entities[payload.id] = payload
      })
      .addCase(updateEligibility.rejected, (state, { meta, payload }) => {
        state.loading[`update_${meta.arg.id}`] = false
        state.errors[`update_${meta.arg.id}`] = payload as string
      })
  },
})

export default eligibilitySlice.reducer

export const selectEligibilitiesForConfigure = (configureId: number) => (s: RootState) => {
  const ids = s.eligibilities.byConfigure[configureId] ?? []
  return ids.map(id => s.eligibilities.entities[id]).filter(Boolean) as BonusEligibilityResponse[]
}
export const selectEligibilityLoading = (key: string) => (s: RootState) => !!s.eligibilities.loading[key]
export const selectEligibilityError   = (key: string) => (s: RootState) => s.eligibilities.errors[key] ?? null
