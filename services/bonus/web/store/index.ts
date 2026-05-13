import { configureStore } from '@reduxjs/toolkit'
import headsReducer    from './slices/headSlice'
import subheadsReducer from './slices/subheadSlice'
import configuresReducer from './slices/configureSlice'

export const store = configureStore({
  reducer: {
    heads:      headsReducer,
    subheads:   subheadsReducer,
    configures: configuresReducer,
  },
})

export type RootState  = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
