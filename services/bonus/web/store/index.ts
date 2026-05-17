import { configureStore } from '@reduxjs/toolkit'
import headsReducer         from './slices/headSlice'
import subheadsReducer      from './slices/subheadSlice'
import configuresReducer    from './slices/configureSlice'
import eligibilitiesReducer from './slices/eligibilitySlice'
import releaseTriggersReducer from './slices/releaseTriggerSlice'

export const store = configureStore({
  reducer: {
    heads:           headsReducer,
    subheads:        subheadsReducer,
    configures:      configuresReducer,
    eligibilities:   eligibilitiesReducer,
    releaseTriggers: releaseTriggersReducer,
  },
})

export type RootState   = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
