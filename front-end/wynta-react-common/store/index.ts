import { configureStore } from '@reduxjs/toolkit';
import copilotReducer from './slices/copilotSlice';

export const store = configureStore({
  reducer: {
    copilot: copilotReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
