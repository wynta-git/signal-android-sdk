import { getToken } from 'wynta-react-common/services/tokenRegistry';

const BASE = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL || 'http://3.7.48.14:8004';
const ROOT = (projectId: string) =>
  `${BASE}/api/v1/campaign/projects/${projectId}/dashboard`;

const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackedMetric {
  value: number | null;
  tracked: boolean;
}

export interface QuickStatItem {
  value: number;
  pct_change?: number | null;
}

export interface QuickStats {
  total_players: number;
  active_players_7d: QuickStatItem;
  new_players_7d: QuickStatItem;
  total_revenue: QuickStatItem;
  campaigns_sent: number;
  messages_delivered: number;
  delivery_rate: QuickStatItem;
  opted_in_push: number;
  at_risk_count: number;
  churned_count: number;
}

export interface PlayerHealth {
  new: number;
  healthy: number;
  at_risk: number;
  churned: number;
  total: number;
}

export interface ChannelOptinEntry {
  opted_in: number;
  total: number;
}

export interface SummaryData {
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
  display_name: string;
  status: 'live' | 'paused';
  reach_pct: number;
  messages_sent: number;
  delivery_rate: number | null;
  open_rate: TrackedMetric;
  ctr: TrackedMetric;
  trend_7d: number[];
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
  id: string;
  name: string;
  channel: string;
  status: string;
  segment_name: string;
  total_sent: number;
  open_rate: TrackedMetric;
  ctr: TrackedMetric;
  click_throughs: TrackedMetric;
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
  delivered: number;
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
  return data;
}

export async function fetchCampaigns(projectId: string, limit = 10, offset = 0): Promise<CampaignsData> {
  const res = await fetch(`${ROOT(projectId)}/campaigns?limit=${limit}&offset=${offset}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchDashboardCampaigns failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return { items: data, total: data.length, offset: 0, limit };
  return data;
}

export async function fetchAnalytics(projectId: string, windowDays = 30): Promise<AnalyticsData> {
  const res = await fetch(`${ROOT(projectId)}/analytics?window_days=${windowDays}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchAnalytics failed: ${res.status}`);
  return res.json();
}
