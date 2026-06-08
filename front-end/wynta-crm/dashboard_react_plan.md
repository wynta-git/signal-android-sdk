# Dashboard — React Implementation Plan

## Context

The business team provided mockup screenshots of a PAM analytics dashboard (MoEngage-style).
A working HTML prototype exists at `clients/web/dashboard.html`.
This plan covers migrating that into the `wynta-crm` Next.js app following the existing
Redux slice + async thunk pattern used by segments and campaigns.

Backend APIs are already live at:
```
GET /api/v1/campaign/projects/{project_id}/dashboard/summary
GET /api/v1/campaign/projects/{project_id}/dashboard/channels
GET /api/v1/campaign/projects/{project_id}/dashboard/segments
GET /api/v1/campaign/projects/{project_id}/dashboard/campaigns
GET /api/v1/campaign/projects/{project_id}/dashboard/analytics
```
All hosted on campaign-engine (`NEXT_PUBLIC_CAMPAIGN_API_URL`, port 8004).
Auth: same `NEXT_PUBLIC_SEG_TOKEN` Bearer token used by campaign/segment APIs.

---

## Key Decisions

- Everything lives inside `wynta-crm/` only — nothing goes into `wynta-react-common`
  (dashboard is CRM-specific)
- Chart library: **TBD** — either Recharts (`npm install recharts`) or pure SVG/CSS
  like the HTML version (no new dependency). Confirm before implementing.
- Untracked metrics (open rate, CTR, click-throughs) render as `—` with a tooltip
  "Not yet tracked"

---

## Files to Create

```
wynta-crm/
├── services/
│   └── dashboardApi.ts              ← 5 fetch functions, one per endpoint
├── store/
│   └── slices/
│       └── dashboardSlice.ts        ← 5 async thunks + unified slice
└── components/
    └── dashboard/
        ├── DashboardPage.tsx        ← main layout, dispatches all thunks on mount
        ├── QuickStats.tsx           ← 10-card grid (2 rows × 5)
        ├── ChannelReach.tsx         ← horizontal bars + Live/Paused pills
        ├── PlayerSegments.tsx       ← segment bars with member counts + %
        ├── ChannelsTable.tsx        ← all-channels performance table + sparklines
        ├── CampaignsTable.tsx       ← live campaign performance table (paginated)
        ├── AnalyticsChart.tsx       ← bar/line chart toggle + MTD summary
        ├── PlayerHealth.tsx         ← New/Healthy/At-Risk/Churned cards + bars
        └── SegmentsBreakdown.tsx    ← donut chart + opted-in counts
```

---

## Files to Edit

| File | Change |
|---|---|
| `wynta-crm/store/index.ts` | Add `dashboard: dashboardReducer` to store |
| `wynta-crm/components/CrmApp.tsx` | Add `{ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }` to `CRM_NAV` |

---

## API Service — `dashboardApi.ts`

Pattern matches `campaignApi.ts` exactly:

```typescript
const BASE = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL || 'http://3.7.48.14:8004';
const ROOT = (projectId: string) =>
  `${BASE}/api/v1/campaign/projects/${projectId}/dashboard`;

const authHeader = () => ({
  Authorization: `Bearer ${process.env.NEXT_PUBLIC_SEG_TOKEN ?? ''}`,
});

export async function fetchSummary(projectId: string, windowDays = 7) { ... }
export async function fetchChannels(projectId: string, windowDays = 7) { ... }
export async function fetchSegments(projectId: string, limit = 10, offset = 0) { ... }
export async function fetchCampaigns(projectId: string, limit = 10, offset = 0) { ... }
export async function fetchAnalytics(projectId: string, windowDays = 30) { ... }
```

---

## Redux Slice — `dashboardSlice.ts`

```typescript
interface DashboardState {
  summary:   SummaryData   | null;
  channels:  ChannelData[] | null;
  segments:  SegmentsData  | null;
  campaigns: CampaignsData | null;
  analytics: AnalyticsData | null;
  status: {
    summary: AsyncStatus;   // 'idle' | 'loading' | 'succeeded' | 'failed'
    channels: AsyncStatus;
    segments: AsyncStatus;
    campaigns: AsyncStatus;
    analytics: AsyncStatus;
  };
  windowDays: number;       // shared query param, default 7
}

// 5 thunks — one per endpoint
export const fetchDashboardSummary   = createAsyncThunk('dashboard/summary',   ...);
export const fetchDashboardChannels  = createAsyncThunk('dashboard/channels',  ...);
export const fetchDashboardSegments  = createAsyncThunk('dashboard/segments',  ...);
export const fetchDashboardCampaigns = createAsyncThunk('dashboard/campaigns', ...);
export const fetchDashboardAnalytics = createAsyncThunk('dashboard/analytics', ...);

// Selectors (createSelector for memoization)
export const selectDashboardSummary   = ...;
export const selectDashboardChannels  = ...;
export const selectDashboardSegments  = ...;
export const selectDashboardCampaigns = ...;
export const selectDashboardAnalytics = ...;
export const selectDashboardStatus    = ...;
export const selectDashboardWindowDays = ...;
```

---

## Component Pattern — `DashboardPage.tsx`

```typescript
export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const windowDays = useAppSelector(selectDashboardWindowDays);

  // Fire all 5 thunks in parallel on mount
  useEffect(() => {
    dispatch(fetchDashboardSummary(windowDays));
    dispatch(fetchDashboardChannels(windowDays));
    dispatch(fetchDashboardSegments());
    dispatch(fetchDashboardCampaigns());
    dispatch(fetchDashboardAnalytics(windowDays));
  }, [dispatch, windowDays]);

  return (
    <div className={styles.page}>
      <QuickStats />
      <div className={styles.twoCol}>
        <ChannelReach />
        <PlayerSegments />
      </div>
      <ChannelsTable />
      <CampaignsTable />
      <div className={styles.analyticsRow}>
        <AnalyticsChart />
        <ReportsPanel />
      </div>
      <div className={styles.healthRow}>
        <PlayerHealth />
        <SegmentsBreakdown />
      </div>
    </div>
  );
}
```

---

## Nav Integration

In `CrmApp.tsx`, add to the existing `CRM_NAV` array:

```typescript
{ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }
```

Clicking it sets `activeNav = 'dashboard'` and renders `<DashboardPage />`.

---

## Store Registration

In `wynta-crm/store/index.ts`:

```typescript
import dashboardReducer from '@/store/slices/dashboardSlice';

export const store = configureStore({
  reducer: {
    brands:    brandsReducer,
    segments:  segmentsReducer,
    campaigns: campaignsReducer,
    dashboard: dashboardReducer,   // ← add this
  },
});
```

---

## Dashboard Sections vs API Mapping

| Section | Endpoint | Key fields used |
|---|---|---|
| Quick Stats (row 1 & 2) | `/summary` | `quick_stats.*` |
| Player Health | `/summary` | `player_health.*` |
| Channel Opt-in | `/summary` | `channel_optin.*` |
| Channel Reach bars | `/channels` | `reach_pct`, `status` |
| All Channels table | `/channels` | `messages_sent`, `delivery_rate`, `trend_7d` |
| Player Segments bars | `/segments` | `members_count`, `pct` |
| Live Campaigns table | `/campaigns` | `total_sent`, `status`, `segment_name` |
| Bar/line chart | `/analytics` | `daily[].sent` |
| MTD Reports panel | `/analytics` | `mtd.*` |
| Segments Breakdown donut | `/summary` | `player_health` buckets |

---

## Untracked Metrics (render as `—`)

These fields return `{ value: null, tracked: false }` from the API:
- Open Rate, CTR, Click-throughs, Opt-outs, Player Responses
- Avg. Open Rate (MTD), Avg. CTR (MTD)
- At-Risk Contacted %, Re-engagement Rate, Win-back Success Rate

Show a `—` with a small tooltip: _"Not yet tracked — requires provider delivery callbacks"_

---

## Pending Decision Before Starting

**Chart library for Campaign Analytics:**
- **Recharts** — `npm install recharts`, declarative, works well with Redux state
- **Pure SVG/CSS** — no dependency, already proven in the HTML prototype

Confirm choice then implementation begins.
