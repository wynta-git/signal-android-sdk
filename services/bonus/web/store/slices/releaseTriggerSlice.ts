import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { apiGet, apiPost, apiPatch } from '@/store/api/client'
import type {
  BonusReleaseTriggerResponse,
  BonusReleaseTriggerCreate,
  BonusReleaseTriggerUpdate,
} from '@/lib/types'
import type { RootState } from '@/store/index'

interface ReleaseTriggerState {
  entities: Record<number, BonusReleaseTriggerResponse>
  byConfigure: Record<number, number[]>
  loading: Record<string, boolean>
  errors: Record<string, string | null>
}

const initialState: ReleaseTriggerState = {
  entities: {},
  byConfigure: {},
  loading: {},
  errors: {},
}

export const fetchReleaseTrigger = createAsyncThunk(
  'releaseTriggers/fetch',
  async (id: number, { rejectWithValue }) => {
    try {
      return await apiGet<BonusReleaseTriggerResponse>(`/bonus-release-triggers/${id}`)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load trigger')
    }
  }
)

export const createReleaseTrigger = createAsyncThunk(
  'releaseTriggers/create',
  async (body: BonusReleaseTriggerCreate, { rejectWithValue }) => {
    try {
      return await apiPost<BonusReleaseTriggerResponse>('/bonus-release-triggers', body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to create trigger')
    }
  }
)

export const updateReleaseTrigger = createAsyncThunk(
  'releaseTriggers/update',
  async ({ id, body }: { id: number; body: BonusReleaseTriggerUpdate }, { rejectWithValue }) => {
    try {
      return await apiPatch<BonusReleaseTriggerResponse>(`/bonus-release-triggers/${id}`, body)
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to update trigger')
    }
  }
)

const releaseTriggerSlice = createSlice({
  name: 'releaseTriggers',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchReleaseTrigger.fulfilled, (state, { payload }) => {
        state.entities[payload.id] = payload
        const list = state.byConfigure[payload.configure_id] ?? []
        if (!list.includes(payload.id)) {
          state.byConfigure[payload.configure_id] = [...list, payload.id]
        }
      })

      .addCase(createReleaseTrigger.pending, (state) => {
        state.loading['create'] = true
        state.errors['create'] = null
      })
      .addCase(createReleaseTrigger.fulfilled, (state, { payload }) => {
        state.loading['create'] = false
        state.entities[payload.id] = payload
        const list = state.byConfigure[payload.configure_id] ?? []
        if (!list.includes(payload.id)) {
          state.byConfigure[payload.configure_id] = [...list, payload.id]
        }
      })
      .addCase(createReleaseTrigger.rejected, (state, { payload }) => {
        state.loading['create'] = false
        state.errors['create'] = payload as string
      })

      .addCase(updateReleaseTrigger.pending, (state, { meta }) => {
        state.loading[`update_${meta.arg.id}`] = true
        state.errors[`update_${meta.arg.id}`] = null
      })
      .addCase(updateReleaseTrigger.fulfilled, (state, { payload }) => {
        state.loading[`update_${payload.id}`] = false
        state.entities[payload.id] = payload
      })
      .addCase(updateReleaseTrigger.rejected, (state, { meta, payload }) => {
        state.loading[`update_${meta.arg.id}`] = false
        state.errors[`update_${meta.arg.id}`] = payload as string
      })
  },
})

export default releaseTriggerSlice.reducer

export const selectTriggersForConfigure = (configureId: number) => (s: RootState) => {
  const ids = s.releaseTriggers.byConfigure[configureId] ?? []
  return ids.map(id => s.releaseTriggers.entities[id]).filter(Boolean) as BonusReleaseTriggerResponse[]
}
export const selectReleaseTriggerLoading = (key: string) => (s: RootState) => !!s.releaseTriggers.loading[key]
export const selectReleaseTriggerError   = (key: string) => (s: RootState) => s.releaseTriggers.errors[key] ?? null
