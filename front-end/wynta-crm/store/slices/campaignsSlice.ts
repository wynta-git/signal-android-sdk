import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as campaignApi from '../../services/campaignApi';
import type { Campaign, CampaignPayload } from '../../services/campaignApi';
import type { AsyncStatus } from 'wynta-react-common/types';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

// ── State ─────────────────────────────────────────────────────────────────────

interface CampaignsState {
  ids:      string[];
  entities: Record<string, Campaign>;
  status:   AsyncStatus;
  actionPending: Record<string, boolean>; // campaignId → true while action is in-flight
}

const initialState: CampaignsState = {
  ids:           [],
  entities:      {},
  status:        'idle',
  actionPending: {},
};

// ── Thunks ────────────────────────────────────────────────────────────────────

/** Module-level lock: prevents concurrent fetchCampaigns calls regardless of store shape */
let _fetchInFlight = false;

export const fetchCampaigns = createAsyncThunk(
  'campaigns/fetchAll',
  async (arg?: { projectId?: string; brandId?: number }) => {
    try {
      return await campaignApi.fetchCampaigns(arg?.projectId ?? PROJECT_ID, arg?.brandId);
    } finally {
      _fetchInFlight = false;
    }
  },
  {
    condition: (_arg, { getState }) => {
      /* Block if another request is already in-flight */
      if (_fetchInFlight) return false;

      /* Also block if the campaigns slice reports loading/succeeded */
      const s = (getState() as { campaigns?: CampaignsState }).campaigns;
      if (s && s.status === 'loading') return false;

      _fetchInFlight = true;
      return true;
    },
  }
);

export const getCampaign = createAsyncThunk(
  'campaigns/get',
  ({ projectId, campaignId }: { projectId?: string; campaignId: string }) =>
    campaignApi.getCampaign(projectId ?? PROJECT_ID, campaignId)
);

export const createCampaign = createAsyncThunk(
  'campaigns/create',
  ({ projectId, payload, brandId }: { projectId?: string; payload: CampaignPayload; brandId?: number }) =>
    campaignApi.createCampaign(projectId ?? PROJECT_ID, payload, brandId)
);

export const updateCampaign = createAsyncThunk(
  'campaigns/update',
  ({ projectId, campaignId, payload }: { projectId?: string; campaignId: string; payload: Partial<CampaignPayload> }) =>
    campaignApi.updateCampaign(projectId ?? PROJECT_ID, campaignId, payload)
      .then(c => ({ campaignId, campaign: c }))
);

export const deleteCampaign = createAsyncThunk(
  'campaigns/delete',
  ({ projectId, campaignId }: { projectId?: string; campaignId: string }) =>
    campaignApi.deleteCampaign(projectId ?? PROJECT_ID, campaignId)
      .then(() => campaignId)
);

export const activateCampaign = createAsyncThunk(
  'campaigns/activate',
  ({ projectId, campaignId }: { projectId?: string; campaignId: string }) =>
    campaignApi.activateCampaign(projectId ?? PROJECT_ID, campaignId)
      .then(c => ({ campaignId, campaign: c }))
);

export const pauseCampaign = createAsyncThunk(
  'campaigns/pause',
  ({ projectId, campaignId }: { projectId?: string; campaignId: string }) =>
    campaignApi.pauseCampaign(projectId ?? PROJECT_ID, campaignId)
      .then(c => ({ campaignId, campaign: c }))
);

export const resumeCampaign = createAsyncThunk(
  'campaigns/resume',
  ({ projectId, campaignId }: { projectId?: string; campaignId: string }) =>
    campaignApi.resumeCampaign(projectId ?? PROJECT_ID, campaignId)
      .then(c => ({ campaignId, campaign: c }))
);

export const cancelCampaign = createAsyncThunk(
  'campaigns/cancel',
  ({ projectId, campaignId }: { projectId?: string; campaignId: string }) =>
    campaignApi.cancelCampaign(projectId ?? PROJECT_ID, campaignId)
      .then(c => ({ campaignId, campaign: c }))
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function upsert(state: CampaignsState, c: Campaign) {
  const id = c.id;
  if (!state.ids.includes(id)) state.ids.push(id);
  state.entities[id] = c;
}

function actionPending(state: CampaignsState, action: { meta: { arg: { campaignId: string } } }) {
  state.actionPending[action.meta.arg.campaignId] = true;
}

function actionDone(state: CampaignsState, { campaignId, campaign }: { campaignId: string; campaign: Campaign }) {
  state.actionPending[campaignId] = false;
  upsert(state, campaign);
}

// ── Slice ─────────────────────────────────────────────────────────────────────

const campaignsSlice = createSlice({
  name: 'campaigns',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchCampaigns.pending,   s => { s.status = 'loading'; })
      .addCase(fetchCampaigns.rejected,  s => { s.status = 'failed'; })
      .addCase(fetchCampaigns.fulfilled, (s, a) => {
        s.status = 'succeeded';
        s.ids = a.payload.map(c => c.id);
        s.entities = Object.fromEntries(a.payload.map(c => [c.id, c]));
      })

      .addCase(getCampaign.fulfilled, (s, a) => { upsert(s, a.payload); })

      .addCase(createCampaign.fulfilled, (s, a) => { upsert(s, a.payload); })

      .addCase(updateCampaign.fulfilled, (s, a) => { upsert(s, a.payload.campaign); })

      .addCase(deleteCampaign.fulfilled, (s, a) => {
        const id = a.payload as string;
        s.ids = s.ids.filter(i => i !== id);
        delete s.entities[id];
      })

      .addCase(activateCampaign.pending,   actionPending)
      .addCase(activateCampaign.fulfilled, (s, a) => actionDone(s, a.payload))

      .addCase(pauseCampaign.pending,   actionPending)
      .addCase(pauseCampaign.fulfilled, (s, a) => actionDone(s, a.payload))

      .addCase(resumeCampaign.pending,   actionPending)
      .addCase(resumeCampaign.fulfilled, (s, a) => actionDone(s, a.payload))

      .addCase(cancelCampaign.pending,   actionPending)
      .addCase(cancelCampaign.fulfilled, (s, a) => actionDone(s, a.payload));
  },
});

// ── Selectors ─────────────────────────────────────────────────────────────────

const safe = (s: { campaigns?: CampaignsState }) => s.campaigns ?? initialState;

export const selectAllCampaigns = (s: { campaigns?: CampaignsState }) => {
  const st = safe(s);
  return st.ids.map(id => st.entities[id]).filter(Boolean) as Campaign[];
};

export const selectCampaignsStatus = (s: { campaigns?: CampaignsState }) =>
  safe(s).status;

export const selectCampaignById = (id: string) =>
  (s: { campaigns?: CampaignsState }) => safe(s).entities[id] ?? null;

export const selectCampaignActionPending = (id: string) =>
  (s: { campaigns?: CampaignsState }) => safe(s).actionPending[id] ?? false;

export default campaignsSlice.reducer;
