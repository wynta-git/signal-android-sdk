import { configureStore } from '@reduxjs/toolkit';
import brandsReducer    from 'wynta-react-common/store/slices/brandsSlice';
import segmentsReducer  from 'wynta-react-common/store/slices/segmentsSlice';
import campaignsReducer from './slices/campaignsSlice';
import dashboardReducer from './slices/dashboardSlice';

export const store = configureStore({
  reducer: {
    brands:    brandsReducer,
    segments:  segmentsReducer,
    campaigns: campaignsReducer,
    dashboard: dashboardReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
