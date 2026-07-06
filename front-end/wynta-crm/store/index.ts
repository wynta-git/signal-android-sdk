import { configureStore } from '@reduxjs/toolkit';
import usersReducer     from 'wynta-react-common/store/slices/usersSlice';
import brandsReducer    from 'wynta-react-common/store/slices/brandsSlice';
import segmentsReducer  from 'wynta-react-common/store/slices/segmentsSlice';
import copilotReducer   from 'wynta-react-common/store/slices/copilotSlice';
import campaignsReducer from './slices/campaignsSlice';
import dashboardReducer from './slices/dashboardSlice';
import eventsReducer    from './slices/eventsSlice';
import reportsReducer   from './slices/reportsSlice';
import uiReducer        from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    users:     usersReducer,
    brands:    brandsReducer,
    segments:  segmentsReducer,
    copilot:   copilotReducer,
    campaigns: campaignsReducer,
    dashboard: dashboardReducer,
    events:    eventsReducer,
    reports:   reportsReducer,
    ui:        uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
