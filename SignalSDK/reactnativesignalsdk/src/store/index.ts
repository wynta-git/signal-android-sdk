import { configureStore } from '@reduxjs/toolkit';
import sdkReducer from './sdkSlice';

export const store = configureStore({
  reducer: {
    sdk: sdkReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
