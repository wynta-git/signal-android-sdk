import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as segmentApi from '../../services/segmentApi';
import type { Segment, SegmentRule, AsyncStatus } from '../../types';
import type { MemberPage, MetaOperators, EvaluateResult } from '../../services/segmentApi';

// ── State ─────────────────────────────────────────────────────────────────────

interface SegmentsState {
  ids: string[];
  entities: Record<string, Segment>;
  members: Record<string, MemberPage>;
  status: AsyncStatus;
  evaluating: Record<string, boolean>;
  evaluateResults: Record<string, EvaluateResult>;
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
  evaluating: {},
  evaluateResults: {},
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

export const getSegment = createAsyncThunk(
  'segments/get',
  (segmentId: string) => segmentApi.getSegment(segmentId)
);

export const updateSegment = createAsyncThunk(
  'segments/update',
  ({ segmentId, ...payload }: {
    segmentId: string;
    name?: string;
    combinator?: 'AND' | 'OR';
    rules?: SegmentRule[];
    refresh_strategy?: 'scheduled' | 'on_event' | 'one_time';
    scheduled_cron?: string;
  }) => segmentApi.updateSegment(segmentId, payload).then(seg => ({ segmentId, seg }))
);

export const deleteSegment = createAsyncThunk(
  'segments/delete',
  (segmentId: string) => segmentApi.deleteSegment(segmentId).then(() => segmentId)
);

export const evaluateSegment = createAsyncThunk(
  'segments/evaluate',
  (segmentId: string) => segmentApi.evaluateSegment(segmentId)
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

      .addCase(getSegment.fulfilled, (state, action) => {
        const s = action.payload;
        const id = String(s.id);
        if (!state.ids.includes(id)) state.ids.push(id);
        state.entities[id] = s;
      })

      .addCase(updateSegment.fulfilled, (state, action) => {
        const { segmentId, seg } = action.payload;
        const id = String(segmentId);
        if (state.entities[id]) state.entities[id] = seg;
      })

      .addCase(deleteSegment.fulfilled, (state, action) => {
        const id = String(action.payload);
        state.ids = state.ids.filter(i => i !== id);
        delete state.entities[id];
        delete state.members[id];
      })

      .addCase(evaluateSegment.pending, (state, action) => {
        state.evaluating[action.meta.arg] = true;
      })
      .addCase(evaluateSegment.fulfilled, (state, action) => {
        const id = action.payload.segment_id;
        state.evaluating[id] = false;
        state.evaluateResults[id] = action.payload;
        if (state.entities[id]) {
          state.entities[id].count = action.payload.size;
        }
      })
      .addCase(evaluateSegment.rejected, (state, action) => {
        state.evaluating[action.meta.arg] = false;
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

export const selectSegmentEvaluating = (segmentId: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.evaluating[segmentId] ?? false;

export const selectEvaluateResult = (segmentId: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.evaluateResults[segmentId];

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
