import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as eventsApi from '../../services/eventsApi';
import type { AsyncStatus } from 'wynta-react-common/types';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

// ── State ─────────────────────────────────────────────────────────────────────

interface EventsState {
  rawEvents:        string[];
  derivedRules:     string[];
  selectedEvent:    string | null;
  eventProperties:  string[];
  traits:           string[];
  status:           AsyncStatus;
  propertiesStatus: AsyncStatus;
  traitsStatus:     AsyncStatus;
  error:            string | null;
  propertiesError:  string | null;
  traitsError:      string | null;
}

const initialState: EventsState = {
  rawEvents:        [],
  derivedRules:     [],
  selectedEvent:    null,
  eventProperties:  [],
  traits:           [],
  status:           'idle',
  propertiesStatus: 'idle',
  traitsStatus:     'idle',
  error:            null,
  propertiesError:  null,
  traitsError:      null,
};

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchEvents = createAsyncThunk(
  'events/fetchAll',
  (projectId?: string) => eventsApi.getEvents(projectId ?? PROJECT_ID),
);

export const fetchTraits = createAsyncThunk(
  'events/fetchTraits',
  () => eventsApi.getTraits(),
);

export const fetchEventProperties = createAsyncThunk(
  'events/fetchProperties',
  ({ eventName, projectId }: { eventName: string; projectId?: string }) =>
    eventsApi.getEventProperties(eventName, projectId ?? PROJECT_ID)
      .then(props => ({ eventName, props })),
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const eventsSlice = createSlice({
  name: 'events',
  initialState,
  reducers: {
    selectEvent(state, action: { payload: string }) {
      state.selectedEvent   = action.payload;
      state.eventProperties = [];
      state.propertiesStatus = 'idle';
      state.propertiesError  = null;
    },
    clearSelectedEvent(state) {
      state.selectedEvent    = null;
      state.eventProperties  = [];
      state.propertiesStatus = 'idle';
      state.propertiesError  = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchEvents.pending,   s => { s.status = 'loading'; s.error = null; })
      .addCase(fetchEvents.fulfilled, (s, a) => {
        s.status       = 'succeeded';
        s.rawEvents    = a.payload.raw_events;
        s.derivedRules = a.payload.derived_rules;
      })
      .addCase(fetchEvents.rejected,  (s, a) => {
        s.status = 'failed';
        s.error  = a.error.message ?? null;
      })

      .addCase(fetchTraits.pending,   s => { s.traitsStatus = 'loading'; s.traitsError = null; })
      .addCase(fetchTraits.fulfilled, (s, a) => { s.traitsStatus = 'succeeded'; s.traits = a.payload; })
      .addCase(fetchTraits.rejected,  (s, a) => { s.traitsStatus = 'failed'; s.traitsError = a.error.message ?? null; })

      .addCase(fetchEventProperties.pending,   s => { s.propertiesStatus = 'loading'; s.propertiesError = null; })
      .addCase(fetchEventProperties.fulfilled, (s, a) => {
        s.propertiesStatus = 'succeeded';
        s.selectedEvent    = a.payload.eventName;
        s.eventProperties  = a.payload.props;
      })
      .addCase(fetchEventProperties.rejected,  (s, a) => {
        s.propertiesStatus = 'failed';
        s.propertiesError  = a.error.message ?? null;
      });
  },
});

export const { selectEvent, clearSelectedEvent } = eventsSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────

interface StateWithEvents { events?: EventsState }

const safe = (s: StateWithEvents) => s.events ?? initialState;

export const selectRawEvents        = (s: StateWithEvents) => safe(s).rawEvents;
export const selectDerivedRules     = (s: StateWithEvents) => safe(s).derivedRules;
export const selectSelectedEvent    = (s: StateWithEvents) => safe(s).selectedEvent;
export const selectEventProperties  = (s: StateWithEvents) => safe(s).eventProperties;
export const selectTraits           = (s: StateWithEvents) => safe(s).traits;
export const selectEventsStatus     = (s: StateWithEvents) => safe(s).status;
export const selectPropertiesStatus = (s: StateWithEvents) => safe(s).propertiesStatus;
export const selectTraitsStatus     = (s: StateWithEvents) => safe(s).traitsStatus;
export const selectEventsError      = (s: StateWithEvents) => safe(s).error;
export const selectPropertiesError  = (s: StateWithEvents) => safe(s).propertiesError;
export const selectTraitsError      = (s: StateWithEvents) => safe(s).traitsError;

export default eventsSlice.reducer;
