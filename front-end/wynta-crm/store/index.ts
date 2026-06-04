import { configureStore } from '@reduxjs/toolkit';
import brandsReducer    from 'wynta-react-common/store/slices/brandsSlice';
import segmentsReducer  from 'wynta-react-common/store/slices/segmentsSlice';
import campaignsReducer from './slices/campaignsSlice';

export const store = configureStore({
  reducer: {
    brands:    brandsReducer,
    segments:  segmentsReducer,
    campaigns: campaignsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
