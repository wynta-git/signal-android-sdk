import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { Segment, Player, AsyncStatus, SegmentRule } from '../../types';

interface SegmentsState {
  ids: (string | number)[];
  entities: Record<string | number, Segment>;
  status: AsyncStatus;
  builderName: string;
  builderProduct: string;
  builderRules: SegmentRule[];
  players: Record<string, { players: Player[]; pageTotal: number; total: number; scopeNote: string }>;
}

interface FetchSegmentPlayersArg {
  segmentId: string | number;
  page: number;
  search: string;
}

interface FetchSegmentPlayersResult {
  segmentId: string | number;
  page: number;
  search: string;
  players: Player[];
  pageTotal: number;
  total: number;
  scopeNote: string;
}

const initialState: SegmentsState = {
  ids: [],
  entities: {},
  status: 'idle',
  builderName: '',
  builderProduct: '',
  builderRules: [],
  players: {},
};

export const fetchSegments = createAsyncThunk<Segment[]>('segments/fetchAll', () => api.fetchSegments());
export const createSegment = createAsyncThunk<Segment, Record<string, unknown>>('segments/create', (payload) => api.createSegment(payload));
export const fetchSegmentPlayers = createAsyncThunk<FetchSegmentPlayersResult, FetchSegmentPlayersArg>(
  'segments/fetchPlayers',
  ({ segmentId, page, search }) =>
    api.fetchSegmentPlayers(segmentId, { page, search }).then((result: Omit<FetchSegmentPlayersResult, 'segmentId' | 'page' | 'search'>) => ({ segmentId, page, search, ...result }))
);

const segmentsSlice = createSlice({
  name: 'segments',
  initialState,
  reducers: {
    setBuilderName(state, action: PayloadAction<string>) { state.builderName = action.payload; },
    setBuilderProduct(state, action: PayloadAction<string>) { state.builderProduct = action.payload; },
    setBuilderRules(state, action: PayloadAction<SegmentRule[]>) { state.builderRules = action.payload; },
    resetBuilder(state) { state.builderName = ''; state.builderProduct = ''; state.builderRules = []; },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchSegments.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.ids = action.payload.map(s => s.id);
        state.entities = Object.fromEntries(action.payload.map(s => [s.id, s]));
      })
      .addCase(createSegment.fulfilled, (state, action) => {
        const s = action.payload;
        state.ids.push(s.id);
        state.entities[s.id] = s;
      })
      .addCase(fetchSegmentPlayers.fulfilled, (state, action) => {
        const { segmentId, page, search, players, pageTotal, total, scopeNote } = action.payload;
        const key = `${segmentId}:${page}:${search}`;
        state.players[key] = { players, pageTotal, total, scopeNote };
      });
  },
});

export const { setBuilderName, setBuilderProduct, setBuilderRules, resetBuilder } = segmentsSlice.actions;
export const selectAllSegments = (state: { segments: SegmentsState }) => state.segments.ids.map(id => state.segments.entities[id]);
export const selectSegmentById = (id: string | number) => (state: { segments: SegmentsState }) => state.segments.entities[id];
export const selectSegmentPlayers = (segmentId: string | number, page: number, search: string) => (state: { segments: SegmentsState }) => state.segments.players[`${segmentId}:${page}:${search}`];
export default segmentsSlice.reducer;
