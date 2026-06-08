
const BASE = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL || 'http://3.7.48.14:8004';
const ROOT = (projectId: string) =>
  `${BASE}/api/v1/campaign/projects/${projectId}/dashboard`;

const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwb3J0YWwtdWkiLCJpc3MiOiJwYW0tYXV0aC1zZXJ2aWNlIiwidHlwZSI6InBvcnRhbCIsInByb2plY3RfaWQiOiJwcm9qX2RlbW8iLCJpYXQiOjE3ODA2NzQwNTQsImV4cCI6MTc4MDY5NTY1NCwic2NvcGUiOlsic2VnbWVudHM6cmVhZCIsInNlZ21lbnRzOndyaXRlIiwiY2FtcGFpZ25zOnJlYWQiLCJjYW1wYWlnbnM6d3JpdGUiXX0.demjLpwe_JjhMJ0RzLxFNCNji_szc0uIVJnqLNuoWZYHm0ynLvfCGctGE8LUcqKfWJ1jQkHG9B4jPsljtp_84An48M7mfmYPoDfgYJB0UmdcYSICHacIY1yFUErX0Q7lpI7ggJYmDEqG_b6_UMMPz0Y3-Xu_EesMptHR1CGsx-n48oXmTskkgD3pgvxhttBDla6s2qsfWpjjhwMa3o_CvHEmyHWSl04fC1Lb5YYiF9ISRyK0bSpFk18WhTCt6A5XyL5w6rNyvZc1Jo3S8i6LxsruztjL7OnJPd7TS9daDHOFieHXCIxzBhEqiZMjyb0FIzIFNXhbDRu2kGuzIzenug`,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackedMetric {
  value: number | null;
  tracked: boolean;
}

export interface QuickStats {
  reachable_players: { value: number; change_pct?: number | null };
  active_this_week:  { value: number; change_pct?: number | null; approximate?: boolean };
  live_campaigns:    { value: number };
  active_segments:   { value: number };
  messages_sent:     { value: number; change_pct?: number | null };
  delivery_rate:     { value: number | null };
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

export interface ChannelOptinEntry { count: number; approximate?: boolean; }

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
  window_days: number;
  daily: DailyAnalytics[];
  mtd: {
    messages_sent:     { value: number; change_pct?: number | null };
    avg_delivery_rate: { value: number | null };
    avg_open_rate:     TrackedMetric;
    avg_ctr:           TrackedMetric;
  };
}

// ── Fetch functions ───────────────────────────────────────────────────────────

export async function fetchSummary(projectId: string, windowDays = 7): Promise<SummaryData> {
  const res = await fetch(`${ROOT(projectId)}/summary?window_days=${windowDays}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchSummary failed: ${res.status}`);
  return res.json();
}

export async function fetchChannels(projectId: string, windowDays = 7): Promise<ChannelData[]> {
  const res = await fetch(`${ROOT(projectId)}/channels?window_days=${windowDays}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchChannels failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.channels ?? data.items ?? []);
}

export async function fetchSegments(projectId: string, limit = 10, offset = 0): Promise<SegmentsData> {
  const res = await fetch(`${ROOT(projectId)}/segments?limit=${limit}&offset=${offset}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchSegments failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return { items: data, total: data.length, offset: 0, limit };
  if (data.segments) return { ...data, items: data.segments };
  return data;
}

export async function fetchCampaigns(projectId: string, limit = 10, offset = 0): Promise<CampaignsData> {
  const res = await fetch(`${ROOT(projectId)}/campaigns?limit=${limit}&offset=${offset}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchDashboardCampaigns failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return { items: data, total: data.length, offset: 0, limit };
  if (data.campaigns) return { ...data, items: data.campaigns };
  return data;
}

export async function fetchAnalytics(projectId: string, windowDays = 30): Promise<AnalyticsData> {
  const res = await fetch(`${ROOT(projectId)}/analytics?window_days=${windowDays}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchAnalytics failed: ${res.status}`);
  return res.json();
}
