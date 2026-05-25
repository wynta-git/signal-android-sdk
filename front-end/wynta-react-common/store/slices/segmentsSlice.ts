import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as segmentApi from '../../services/segmentApi';
import type { Segment, SegmentRule, AsyncStatus } from '../../types';
import type { MemberPage, MetaOperators } from '../../services/segmentApi';

// ── State ─────────────────────────────────────────────────────────────────────

interface SegmentsState {
  ids: string[];
  entities: Record<string, Segment>;
  members: Record<string, MemberPage>;
  status: AsyncStatus;
  metaTraits: string[];
  metaEvents: string[];
  metaOperators: MetaOperators | null;
  metaEventProperties: Record<string, string[]>;
}

const initialState: SegmentsState = {
  ids: [],
  entities: {},
  members: {},
  status: 'idle',
  metaTraits: [],
  metaEvents: [],
  metaOperators: null,
  metaEventProperties: {},
};

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchSegments = createAsyncThunk(
  'segments/fetchAll',
  () => segmentApi.fetchSegments()
);

export const createSegment = createAsyncThunk(
  'segments/create',
  (payload: { name: string; description: string; combinator: 'AND' | 'OR'; rules: SegmentRule[] }) =>
    segmentApi.createSegment(payload)
);

export const fetchSegmentMembers = createAsyncThunk(
  'segments/fetchMembers',
  ({ segmentId, cursor }: { segmentId: string; cursor?: string }) =>
    segmentApi.fetchSegmentMembers(segmentId, cursor).then(result => ({ segmentId, ...result }))
);

export const fetchMetaTraits = createAsyncThunk(
  'segments/fetchMetaTraits',
  (projectId: string) => segmentApi.fetchMetaTraits(projectId)
);

export const fetchMetaEvents = createAsyncThunk(
  'segments/fetchMetaEvents',
  (projectId: string) => segmentApi.fetchMetaEvents(projectId)
);

export const fetchMetaOperators = createAsyncThunk(
  'segments/fetchMetaOperators',
  () => segmentApi.fetchMetaOperators()
);

export const fetchMetaEventProperties = createAsyncThunk(
  'segments/fetchMetaEventProperties',
  ({ projectId, eventName }: { projectId: string; eventName: string }) =>
    segmentApi.fetchMetaEventProperties(projectId, eventName)
      .then(props => ({ eventName, props }))
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const segmentsSlice = createSlice({
  name: 'segments',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchSegments.pending,   (state) => { state.status = 'loading'; })
      .addCase(fetchSegments.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.ids = action.payload.map(s => String(s.id));
        state.entities = Object.fromEntries(action.payload.map(s => [String(s.id), s]));
      })
      .addCase(fetchSegments.rejected,  (state) => { state.status = 'failed'; })

      .addCase(createSegment.fulfilled, (state, action) => {
        const s = action.payload;
        const id = String(s.id);
        state.ids.push(id);
        state.entities[id] = s;
      })

      .addCase(fetchSegmentMembers.fulfilled, (state, action) => {
        const { segmentId, ...page } = action.payload;
        state.members[segmentId] = page;
      })

      .addCase(fetchMetaTraits.fulfilled, (state, action) => {
        state.metaTraits = action.payload;
      })

      .addCase(fetchMetaEvents.fulfilled, (state, action) => {
        state.metaEvents = action.payload;
      })

      .addCase(fetchMetaOperators.fulfilled, (state, action) => {
        state.metaOperators = action.payload;
      })

      .addCase(fetchMetaEventProperties.fulfilled, (state, action) => {
        const { eventName, props } = action.payload;
        state.metaEventProperties[eventName] = props;
      });
  },
});

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectAllSegments = (state: { segments: SegmentsState }) =>
  state.segments.ids.map(id => state.segments.entities[id]);

export const selectSegmentsStatus = (state: { segments: SegmentsState }) =>
  state.segments.status;

export const selectSegmentMembers = (segmentId: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.members[segmentId];

export const selectMetaTraits = (state: { segments: SegmentsState }) =>
  state.segments.metaTraits;

export const selectMetaEvents = (state: { segments: SegmentsState }) =>
  state.segments.metaEvents;

export const selectMetaOperators = (state: { segments: SegmentsState }) =>
  state.segments.metaOperators;

export const selectMetaEventProperties = (eventName: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.metaEventProperties[eventName] ?? [];

export default segmentsSlice.reducer;
