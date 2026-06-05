import { configureStore } from '@reduxjs/toolkit';
import usersReducer     from 'wynta-react-common/store/slices/usersSlice';
import brandsReducer    from 'wynta-react-common/store/slices/brandsSlice';
import segmentsReducer  from 'wynta-react-common/store/slices/segmentsSlice';
import campaignsReducer from './slices/campaignsSlice';
import eventsReducer    from './slices/eventsSlice';

export const store = configureStore({
  reducer: {
    users:     usersReducer,
    brands:    brandsReducer,
    segments:  segmentsReducer,
    campaigns: campaignsReducer,
    events:    eventsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
