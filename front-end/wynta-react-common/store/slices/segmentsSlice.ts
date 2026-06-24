import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as segmentApi from '../../services/segmentApi';
import type {
  Segment, SegmentRule, AsyncStatus,
  MetaEventItem, TraitOperatorsResponse, DerivedRuleConfig, ParameterOperatorsResponse,
} from '../../types';
import type { MemberPage, MetaOperators, EvaluateResult } from '../../services/segmentApi';

// ── State ─────────────────────────────────────────────────────────────────────

interface SegmentsState {
  ids: string[];
  entities: Record<string, Segment>;
  members: Record<string, MemberPage>;
  status: AsyncStatus;
  evaluating: Record<string, boolean>;
  evaluateResults: Record<string, EvaluateResult>;
  // Meta — events (raw + derived combined)
  metaEvents: MetaEventItem[];
  // Meta — traits
  metaTraits: string[];
  // Meta — global operators (fallback)
  metaOperators: MetaOperators | null;
  // Per-event properties (raw events)
  metaEventProperties: Record<string, string[]>;
  // Per-trait operators: keyed by trait name
  metaTraitOperators: Record<string, TraitOperatorsResponse>;
  // Derived rule configs: keyed by rule_name
  metaDerivedRules: Record<string, DerivedRuleConfig>;
  // Derived rule param operators: keyed by "${rule_name}:${param_name}"
  metaDerivedParamOps: Record<string, ParameterOperatorsResponse>;
}

const initialState: SegmentsState = {
  ids: [],
  entities: {},
  members: {},
  status: 'idle',
  evaluating: {},
  evaluateResults: {},
  metaEvents: [],
  metaTraits: [],
  metaOperators: null,
  metaEventProperties: {},
  metaTraitOperators: {},
  metaDerivedRules: {},
  metaDerivedParamOps: {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchSegments = createAsyncThunk(
  'segments/fetchAll',
  (brandId?: number) => segmentApi.fetchSegments(brandId)
);

export const createSegment = createAsyncThunk(
  'segments/create',
  (payload: {
    name: string;
    description: string;
    combinator: 'AND' | 'OR';
    rules: SegmentRule[];
    refresh_strategy?: string;
    scheduled_cron?: string;
    created_by?: string | null;
    segmentType?: 'filter' | 'custom';
    csvFile?: File;
    brandId?: number;
  }) => segmentApi.createSegment(payload)
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
  (projectId: string) => segmentApi.fetchMetaTraits(projectId),
  {
    condition: (_arg, { getState }) => {
      const s = (getState() as { segments?: SegmentsState }).segments;
      return !s || s.metaTraits.length === 0;
    },
  }
);

/** Fetches raw_events + derived_rules, combines into MetaEventItem[] */
export const fetchMetaEvents = createAsyncThunk(
  'segments/fetchMetaEvents',
  async (projectId: string): Promise<MetaEventItem[]> => {
    const raw = await segmentApi.fetchMetaEvents(projectId);
    // Normalise: handle both old string[] (legacy) and new { raw_events, derived_rules }
    if (Array.isArray(raw)) {
      return (raw as unknown as string[]).map(e => ({
        id: e, label: toLabel(e), source: 'raw_event' as const,
      }));
    }
    const items: MetaEventItem[] = [];
    for (const e of (raw.raw_events ?? [])) {
      items.push({ id: e, label: toLabel(e), source: 'raw_event' });
    }
    for (const r of (raw.derived_rules ?? [])) {
      items.push({ id: r, label: toLabel(r), source: 'derived_rule' });
    }
    return items;
  },
  {
    condition: (_arg, { getState }) => {
      const s = (getState() as { segments?: SegmentsState }).segments;
      return !s || s.metaEvents.length === 0;
    },
  }
);

export const fetchMetaOperators = createAsyncThunk(
  'segments/fetchMetaOperators',
  () => segmentApi.fetchMetaOperators(),
  {
    condition: (_arg, { getState }) => {
      const s = (getState() as { segments?: SegmentsState }).segments;
      return !s || s.metaOperators === null;
    },
  }
);

export const fetchMetaEventProperties = createAsyncThunk(
  'segments/fetchMetaEventProperties',
  ({ projectId, eventName }: { projectId: string; eventName: string }) =>
    segmentApi.fetchMetaEventProperties(projectId, eventName)
      .then(props => ({ eventName, props }))
);

/** Fetches operators for a specific trait. Cached in metaTraitOperators. */
export const fetchTraitOperators = createAsyncThunk(
  'segments/fetchTraitOperators',
  (trait: string) =>
    segmentApi.fetchTraitOperators(trait).then(data => ({ trait, data }))
);

/** Fetches config (parameters) for a derived rule. Cached in metaDerivedRules. */
export const fetchDerivedRuleConfig = createAsyncThunk(
  'segments/fetchDerivedRuleConfig',
  (ruleName: string) =>
    segmentApi.fetchDerivedRuleConfig(ruleName).then(data => ({ ruleName, data }))
);

/** Fetches operators for one parameter of a derived rule. Cached in metaDerivedParamOps. */
export const fetchDerivedRuleParamOperators = createAsyncThunk(
  'segments/fetchDerivedRuleParamOperators',
  ({ ruleName, paramName }: { ruleName: string; paramName: string }) =>
    segmentApi.fetchDerivedRuleParamOperators(ruleName, paramName)
      .then(data => ({ ruleName, paramName, data }))
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
      })

      .addCase(fetchTraitOperators.fulfilled, (state, action) => {
        state.metaTraitOperators[action.payload.trait] = action.payload.data;
      })

      .addCase(fetchDerivedRuleConfig.fulfilled, (state, action) => {
        const data = action.payload.data;

        if (data && !Array.isArray(data.parameters)) {
          // Object-dict shape → normalise to array
          data.parameters = Object.entries(
            (data.parameters as Record<string, Record<string, unknown>>) ?? {}
          ).map(([name, cfg]) => ({
            name,
            key:  name,
            label: (cfg?.label as string) ?? undefined,
            type:  (cfg?.type  as string) ?? 'text',
            options: Array.isArray(cfg?.options) ? (cfg.options as string[]) : undefined,
            default_value: (cfg?.default_value as string) ?? undefined,
          }));
        } else if (data && Array.isArray(data.parameters)) {
          // New array shape: each entry may use `key` instead of `name`
          data.parameters = data.parameters.map((p: any) => ({
            ...p,
            // Canonicalise: prefer existing `name`, fall back to `key`
            name: (p.name ?? p.key ?? '') as string,
            key:  (p.key  ?? p.name ?? '') as string,
            type: (p.type ?? 'text') as string,
          }));
        }

        state.metaDerivedRules[action.payload.ruleName] = data;
      })

      .addCase(fetchDerivedRuleParamOperators.fulfilled, (state, action) => {
        const key = `${action.payload.ruleName}:${action.payload.paramName}`;
        state.metaDerivedParamOps[key] = action.payload.data;
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

/** Returns combined MetaEventItem[] (raw_events + derived_rules) */
export const selectMetaEvents = (state: { segments: SegmentsState }) =>
  state.segments.metaEvents;

export const selectMetaOperators = (state: { segments: SegmentsState }) =>
  state.segments.metaOperators;

export const selectMetaEventProperties = (eventName: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.metaEventProperties[eventName] ?? [];

export const selectMetaTraitOperators = (trait: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.metaTraitOperators[trait] ?? null;

export const selectDerivedRuleConfig = (ruleName: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.metaDerivedRules[ruleName] ?? null;

export const selectDerivedRuleParamOps = (ruleName: string, paramName: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.metaDerivedParamOps[`${ruleName}:${paramName}`] ?? null;

export const selectSegmentById = (id: string) =>
  (state: { segments: SegmentsState }) =>
    state.segments.entities[id] ?? null;

/** Returns the full evaluating map so callers can check any id without per-row hooks. */
export const selectAllEvaluating = (state: { segments: SegmentsState }) =>
  state.segments.evaluating;

export default segmentsSlice.reducer;
