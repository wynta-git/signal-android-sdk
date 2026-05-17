import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/services/api';

export const fetchSegments = createAsyncThunk('segments/fetchAll', () => api.fetchSegments());
export const createSegment = createAsyncThunk('segments/create', (payload) => api.createSegment(payload));
export const fetchSegmentPlayers = createAsyncThunk('segments/fetchPlayers', ({ segmentId, page, search }) =>
  api.fetchSegmentPlayers(segmentId, { page, search }).then(result => ({ segmentId, page, search, ...result }))
);

const segmentsSlice = createSlice({
  name: 'segments',
  initialState: {
    ids: [],
    entities: {},
    status: 'idle',
    builderName: '',
    builderProduct: '',
    builderRules: [],
    players: {},
  },
  reducers: {
    setBuilderName(state, action) { state.builderName = action.payload; },
    setBuilderProduct(state, action) { state.builderProduct = action.payload; },
    setBuilderRules(state, action) { state.builderRules = action.payload; },
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
export const selectAllSegments = (state) => state.segments.ids.map(id => state.segments.entities[id]);
export const selectSegmentById = (id) => (state) => state.segments.entities[id];
export const selectSegmentPlayers = (segmentId, page, search) => (state) => state.segments.players[`${segmentId}:${page}:${search}`];
export default segmentsSlice.reducer;
