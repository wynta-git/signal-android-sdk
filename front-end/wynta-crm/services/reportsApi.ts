import { getToken } from 'wynta-react-common/services/tokenRegistry';

const BASE = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL || "http://3.7.48.14:8004";
const root = (projectId: string) => `${BASE}/api/v1/campaign/projects/${projectId}/reports`;

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

export type DateRange = 'last_7_days' | 'last_30_days' | 'last_90_days';

export interface ReportFilters {
  date_range: DateRange;
  channel: string;
  segment_id: string | null;
}

export interface MetricValue {
  value: number | null;
  change_pct?: number | null;
  tracked?: boolean;
}

export interface CustomReport {
  report_id: string;
  user_id: string;
  project_id: string;
  name: string;
  metrics: string[];
  filters: ReportFilters;
  created_at: string;
  updated_at: string;
}

export interface CustomReportWithData extends CustomReport {
  data: Record<string, MetricValue>;
}

export interface CreateReportPayload {
  name: string;
  metrics: string[];
  filters: ReportFilters;
}

export async function createReport(projectId: string, payload: CreateReportPayload): Promise<{ report_id: string }> {
  const res = await fetch(root(projectId), {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`createReport failed: ${res.status}`);
  return res.json();
}

export async function listReports(projectId: string): Promise<CustomReport[]> {
  const res = await fetch(root(projectId), { headers: authHeader() });
  if (!res.ok) throw new Error(`listReports failed: ${res.status}`);
  const data = await res.json();
  return data.reports ?? [];
}

export async function getReport(projectId: string, reportId: string): Promise<CustomReportWithData> {
  const res = await fetch(`${root(projectId)}/${reportId}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getReport failed: ${res.status}`);
  return res.json();
}

export async function updateReport(
  projectId: string,
  reportId: string,
  payload: Partial<CreateReportPayload>,
): Promise<CustomReport> {
  const res = await fetch(`${root(projectId)}/${reportId}`, {
    method: 'PATCH',
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`updateReport failed: ${res.status}`);
  return res.json();
}

export async function deleteReport(projectId: string, reportId: string): Promise<void> {
  const res = await fetch(`${root(projectId)}/${reportId}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`deleteReport failed: ${res.status}`);
}

// ── Campaign Stats Report ─────────────────────────────────────────────────

export interface CampaignStatsFilters {
  windowDays: number;
  channel:    string;
  segmentId:  string | null;
  brandId?:   number;
}

export interface TrendPoint {
  date:      string;
  primary:   number;
  secondary: number;
  tertiary:  number;
}

export interface CampaignRow {
  campaign_id: string;
  name:        string;
  channel:     string;
  sent:        number;
  open_rate:   number | null;
  ctr:         number | null;
  conversions: number | null;
  status:      string;
}

export interface CampaignStatsData {
  window_days: number;
  summary: {
    total_sent:          MetricValue;
    avg_open_rate:       MetricValue;
    avg_ctr:             MetricValue;
    conversions:         MetricValue;
    revenue_influenced:  MetricValue;
  };
  trend:     TrendPoint[];
  campaigns: CampaignRow[];
}

// ── Segment Analysis Report ───────────────────────────────────────────────

export interface SegmentRow {
  segment_id: string;
  name:       string;
  users:      number;
  growth_7d:  number | null;
  open_rate:  number | null;
  conversion: number | null;
  status:     string;
}

export interface SegmentAnalysisData {
  window_days: number;
  summary: {
    total_segments:   MetricValue;
    reachable_users:  MetricValue;
    segment_growth:   MetricValue;
    avg_segment_size: MetricValue;
    opt_in_rate:      MetricValue;
  };
  trend:    TrendPoint[];
  segments: SegmentRow[];
}

export interface SegmentAnalysisFilters {
  windowDays: number;
  segmentId:  string | null;
  brandId?:   number;
}

export async function getSegmentAnalysis(
  projectId: string,
  filters: SegmentAnalysisFilters,
): Promise<SegmentAnalysisData> {
  const params = new URLSearchParams({
    window_days: String(filters.windowDays),
    ...(filters.segmentId ? { segment_id: filters.segmentId } : {}),
  });
  if (filters.brandId) params.set('brand_id', String(filters.brandId));
  const res = await fetch(`${root(projectId)}/segment-analysis?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getSegmentAnalysis failed: ${res.status}`);
  return res.json();
}

// ── Channel Delivery Report ───────────────────────────────────────────────

export interface ChannelRow {
  channel:       string;
  messages:      number;
  delivery_rate: number | null;
  bounce_rate:   number | null;
  open_rate:     number | null;
  ctr:           number | null;
  opt_outs:      number | null;
}

export interface ChannelDeliveryData {
  window_days: number;
  summary: {
    total_messages:  MetricValue;
    delivery_rate:   MetricValue;
    bounce_rate:     MetricValue;
    opt_outs_7d:     MetricValue;
    active_channels: { value: number; paused: number };
  };
  trend:    TrendPoint[];
  channels: ChannelRow[];
}

export interface ChannelDeliveryFilters {
  windowDays: number;
  channel:    string;
  segmentId:  string | null;
  brandId?:   number;
}

export async function getChannelDelivery(
  projectId: string,
  filters: ChannelDeliveryFilters,
): Promise<ChannelDeliveryData> {
  const params = new URLSearchParams({
    window_days: String(filters.windowDays),
    channel:     filters.channel,
    ...(filters.segmentId ? { segment_id: filters.segmentId } : {}),
  });
  if (filters.brandId) params.set('brand_id', String(filters.brandId));
  const res = await fetch(`${root(projectId)}/channel-delivery?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getChannelDelivery failed: ${res.status}`);
  return res.json();
}

// ── Player Lifecycle Report ───────────────────────────────────────────────

export interface LifecycleStageRow {
  stage:             string;
  players:           number;
  pct_of_total:      number | null;
  avg_deposits_30d:  number | null;
  days_since_active: string;
  crm_touchpoints:   number | null;
}

export interface PlayerLifecycleData {
  window_days: number;
  summary: {
    total_players: MetricValue;
    healthy:       { value: number; pct: number | null };
    at_risk:       { value: number; pct: number | null };
    churned:       { value: number; pct: number | null };
    win_back_rate: MetricValue;
  };
  trend:  TrendPoint[];
  stages: LifecycleStageRow[];
}

export interface PlayerLifecycleFilters {
  windowDays: number;
  segmentId:  string | null;
  brandId?:   number;
}

export async function getPlayerLifecycle(
  projectId: string,
  filters: PlayerLifecycleFilters,
): Promise<PlayerLifecycleData> {
  const params = new URLSearchParams({
    window_days: String(filters.windowDays),
    ...(filters.segmentId ? { segment_id: filters.segmentId } : {}),
  });
  if (filters.brandId) params.set('brand_id', String(filters.brandId));
  const res = await fetch(`${root(projectId)}/player-lifecycle?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getPlayerLifecycle failed: ${res.status}`);
  return res.json();
}

// ── Churn & Retention Report ──────────────────────────────────────────────

export interface CohortRow {
  cohort:         string;
  players:        number;
  churned:        number;
  retained:       number;
  win_back:       number;
  revenue_impact: number | null;
}

export interface ChurnRetentionData {
  window_days: number;
  summary: {
    churn_rate:      MetricValue;
    churned_players: MetricValue;
    retained:        MetricValue;
    win_back_rate:   MetricValue;
    revenue_saved:   MetricValue;
  };
  trend:   TrendPoint[];
  cohorts: CohortRow[];
}

export interface ChurnRetentionFilters {
  windowDays: number;
  channel:    string;
  segmentId:  string | null;
  brandId?:   number;
}

export async function getChurnRetention(
  projectId: string,
  filters: ChurnRetentionFilters,
): Promise<ChurnRetentionData> {
  const params = new URLSearchParams({
    window_days: String(filters.windowDays),
    channel:     filters.channel,
    ...(filters.segmentId ? { segment_id: filters.segmentId } : {}),
  });
  if (filters.brandId) params.set('brand_id', String(filters.brandId));
  const res = await fetch(`${root(projectId)}/churn-retention?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getChurnRetention failed: ${res.status}`);
  return res.json();
}

export async function getCampaignStats(
  projectId: string,
  filters: CampaignStatsFilters,
): Promise<CampaignStatsData> {
  const params = new URLSearchParams({
    window_days: String(filters.windowDays),
    channel:     filters.channel,
    ...(filters.segmentId ? { segment_id: filters.segmentId } : {}),
  });
  if (filters.brandId) params.set('brand_id', String(filters.brandId));
  const res = await fetch(`${root(projectId)}/campaign-stats?${params}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getCampaignStats failed: ${res.status}`);
  return res.json();
}
