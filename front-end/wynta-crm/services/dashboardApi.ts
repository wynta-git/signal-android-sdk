import { getToken } from 'wynta-react-common/services/tokenRegistry';

const BASE = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL || 'http://3.7.48.14:8004';
const ROOT = (projectId: string) =>
  `${BASE}/api/v1/campaign/projects/${projectId}/dashboard`;

// // Hardcoded token (expired — kept for reference):
// // Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...proj_demo...

const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackedMetric {
  value: number | null;
  tracked: boolean;
  change_pct?: number | null;
}

export interface QuickStats {
  reachable_players: { value: number; change_pct?: number | null };
  active_this_week:  { value: number; change_pct?: number | null; approximate?: boolean };
  live_campaigns:    { value: number };
  active_segments:   { value: number };
  messages_sent:     { value: number; change_pct?: number | null };
  delivery_rate:     { value: number | null; change_pct?: number | null };
  open_rate:         TrackedMetric;
  ctr:               TrackedMetric;
  opt_outs:          TrackedMetric;
  player_responses:  TrackedMetric;
}

export interface HealthBucket { count: number; pct: number | null; }

export interface PlayerHealth {
  approximate: boolean;
  total_users: number;
  new: HealthBucket;
  healthy: HealthBucket;
  at_risk: HealthBucket;
  churned: HealthBucket;
}

export interface ChannelOptinEntry { count: number; approximate?: boolean; change_pct?: number | null; }

export interface SummaryData {
  window_days: number;
  quick_stats: QuickStats;
  player_health: PlayerHealth;
  channel_optin: {
    push: ChannelOptinEntry;
    email: ChannelOptinEntry;
    sms: ChannelOptinEntry;
  };
}

export interface ChannelData {
  channel: string;
  opted_in_users: number | null;
  status: 'live' | 'paused';
  reach_pct: number | null;
  messages_sent: number;
  delivery_rate: number | null;
  open_rate: number | null;
  ctr: number | null;
  trend_7d: { date: string; sent: number; failed: number }[];
}

export interface SegmentItem {
  id: string;
  name: string;
  members_count: number;
  pct: number;
}

export interface SegmentsData {
  items: SegmentItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface DashboardCampaignItem {
  campaign_id: string;
  name: string;
  channel: string;
  status: string;
  segment_id: string | null;
  segment_name: string | null;
  total_sent: number;
  open_rate: number | null;
  ctr: number | null;
  click_throughs: number | null;
}

export interface CampaignsData {
  items: DashboardCampaignItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface DailyAnalytics {
  date: string;
  sent: number;
  failed: number;
}

export interface AnalyticsData {
  daily: DailyAnalytics[];
  mtd: {
    total_sent: number;
    total_delivered: number;
    avg_open_rate: TrackedMetric;
    avg_ctr: TrackedMetric;
  };
}

// ── Fetch functions ───────────────────────────────────────────────────────────

export async function fetchSummary(
  projectId: string,
  windowDays = 30,
  startDate?: string,
  endDate?: string,
  compareStart?: string,
  compareEnd?: string,
  brandId?: number,
): Promise<SummaryData> {
  const params = new URLSearchParams({ window_days: String(windowDays) });
  if (startDate)    params.set('start_date',    startDate);
  if (endDate)      params.set('end_date',      endDate);
  if (compareStart) params.set('compare_start', compareStart);
  if (compareEnd)   params.set('compare_end',   compareEnd);
  if (brandId)      params.set('brand_id',      String(brandId));
  const res = await fetch(`${ROOT(projectId)}/summary?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchSummary failed: ${res.status}`);
  return res.json();
}

export async function fetchChannels(
  projectId: string,
  windowDays = 30,
  startDate?: string,
  endDate?: string,
  brandId?: number,
): Promise<ChannelData[]> {
  const params = new URLSearchParams({ window_days: String(windowDays) });
  if (startDate) params.set('start_date', startDate);
  if (endDate)   params.set('end_date',   endDate);
  if (brandId)   params.set('brand_id',   String(brandId));
  const res = await fetch(`${ROOT(projectId)}/channels?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchChannels failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.channels ?? data.items ?? []);
}

export async function fetchSegments(projectId: string, limit = 10, offset = 0, brandId?: number): Promise<SegmentsData> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (brandId) params.set('brand_id', String(brandId));
  const res = await fetch(`${ROOT(projectId)}/segments?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchSegments failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return { items: data, total: data.length, offset: 0, limit };
  if (data.segments) return { ...data, items: data.segments };
  return data;
}

export async function fetchCampaigns(projectId: string, limit = 10, offset = 0, brandId?: number): Promise<CampaignsData> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (brandId) params.set('brand_id', String(brandId));
  const res = await fetch(`${ROOT(projectId)}/campaigns?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchDashboardCampaigns failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return { items: data, total: data.length, offset: 0, limit };
  if (data.campaigns) return { ...data, items: data.campaigns };
  return data;
}

export async function fetchAnalytics(
  projectId: string,
  windowDays = 30,
  startDate?: string,
  endDate?: string,
  compareStart?: string,
  compareEnd?: string,
  brandId?: number,
): Promise<AnalyticsData> {
  const params = new URLSearchParams({ window_days: String(windowDays) });
  if (startDate)    params.set('start_date',    startDate);
  if (endDate)      params.set('end_date',      endDate);
  if (compareStart) params.set('compare_start', compareStart);
  if (compareEnd)   params.set('compare_end',   compareEnd);
  if (brandId)      params.set('brand_id',      String(brandId));
  const res = await fetch(`${ROOT(projectId)}/analytics?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchAnalytics failed: ${res.status}`);
  return res.json();
}
