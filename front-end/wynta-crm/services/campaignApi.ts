const BASE = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL || "http://3.7.48.14:8004";
const CAMPAIGN_ROOT = `${BASE}/api/v1/campaign/projects`;

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.NEXT_PUBLIC_SEG_TOKEN ?? ""}`,
});

// ── Types (UI model) ──────────────────────────────────────────────────────────

export type CampaignStatus   = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
export type CampaignChannel  = 'push' | 'email' | 'sms' | 'in_app' | 'on_site' | 'cards' | 'whatsapp' | 'telegram' | 'rcs';
export type PeriodicType     = 'daily' | 'weekly' | 'monthly';
export type ScheduleType     = 'one_time' | 'periodic';
export type TriggerCriteria  = 'on_session_start' | 'on_screen_load' | 'on_custom_event';

export interface CampaignSchedule {
  // top-level discriminator (both old and new payloads)
  schedule_type?:    ScheduleType;
  type?:             ScheduleType;         // legacy field
  // one-time fields
  execution_type?:   'asap' | 'specific_datetime';
  datetime?:         string;
  send_at?:          string;               // legacy
  // periodic common fields
  frequency?:        PeriodicType;
  periodic_type?:    PeriodicType;         // legacy
  start_date?:       string;
  end_date?:         string;
  trigger_time?:     string;
  timezone?:         string;
  // weekly-specific
  days?:             string[];
  // monthly-specific
  dates?:            number[];
  // legacy fields
  cron?:             string;
}

export interface CampaignDeliveryControls {
  max_frequency?:                number;
  per_user_per_campaign_total?:  number;
  min_delay?:                    number;
  min_delay_unit?:               string;
  ignore_global_delay?:          boolean;
  auto_dismiss_after?:           number;
}

export interface ContentBlock {
  id:   string;
  type: 'greeting' | 'heading' | 'text' | 'image' | 'hero_banner' | 'vip_offer' | 'promo_card' | 'bonus_offer' | 'countdown' | 'coupon' | 'cta_button' | 'poll' | 'divider' | 'spacer' | 'rg_footer' | 'variable';
  data: Record<string, string>;
}

export interface Campaign {
  id:                   string;
  name:                 string;
  channel:              CampaignChannel;
  status:               CampaignStatus;
  // Campaign details
  objective?:           string;
  tags?:                string[];
  platforms?:           string[];
  template_id?:         string;
  // Trigger
  trigger_type?:        string;
  trigger_event_name?:  string;
  trigger_criteria?:    TriggerCriteria;
  // Audience / Segment
  segment_id?:          string;
  segment_name?:        string;
  audience_all?:        boolean;
  // Push notification content
  title?:               string;
  content?:             string;
  deep_link?:           string;
  // Rich content blocks (non-push channels)
  content_blocks?:      ContentBlock[];
  // Schedule
  schedule?:            CampaignSchedule;
  // Controls
  delivery_controls?:   CampaignDeliveryControls;
  // Meta
  revenue_impact?:      number;
  last_activity?:       string;
  created_at?:          string;
  updated_at?:          string;
  created_by?:          string;
  picked?:              boolean;
  retry_count?:         number;
}

export type CampaignPayload = Omit<Campaign, 'id' | 'created_at' | 'updated_at'> & {
  status?: CampaignStatus;
};

// ── Raw API shape (as returned by the backend) ────────────────────────────────
// Mirrors the nested structure that toApiPayload produces and the backend echoes.

interface RawSchedule {
  type?:          string;        // 'immediate' | 'once' | 'daily' | 'weekly' | 'monthly'
  timezone?:      string;
  start_date?:    string;
  end_date?:      string;
  schedule_time?: string;        // HH:MM 24-h
  send_at?:       string;        // ISO datetime used by 'once' schedule type
  days_of_week?:  string[];
  days_of_month?: number[];
}

interface RawCampaign {
  campaign_id:   string;
  project_id?:   string;
  name:          string;
  status:        CampaignStatus;
  tags?:         string;         // comma-separated string from backend
  objective?:    string;
  // Nested trigger
  trigger?: {
    type?:       string;
    schedule?:   RawSchedule;
    event_name?: string;
    cron?:       string;
    send_at?:    string;
  };
  // Nested audience
  audience?: {
    segment_id?:        string;
    target_platforms?:  string[];
    all?:               boolean;
  };
  // Nested channel (object shape sent/received)
  channel?: {
    type?:        string;
    template_id?: string | null;
    message?: {
      title?:     string;
      body?:      string;
      deep_link?: string;
    };
  } | string;                    // some list responses may return just the string
  // Top-level message / notification fallback shapes
  message?: {
    title?:     string;
    body?:      string;
    deep_link?: string;
  };
  notification?: {
    title?:     string;
    body?:      string;
    deep_link?: string;
  };
  // Fully-flattened fallback
  title?:               string;
  body?:                string;
  content?:             string;
  deep_link?:           string;
  notification_title?:  string;
  notification_body?:   string;
  deeplink?:            string;
  // Nested delivery
  delivery?: {
    rate_limit?: {
      per_user_per_day?:            number;
      per_user_per_campaign_total?: number;
    };
    delay?: { minutes?: number };
    min_delay_between_sends_minutes?: number;
    ignore_global_min_delay?: boolean;
    auto_dismiss?: { dismiss_after_seconds?: number };
  };
  // Legacy flat fields (older list responses)
  rate_limit?: { per_user_per_day?: number; per_user_per_campaign_total?: number };
  delay?:      { minutes?: number };
  // Meta
  created_at?:  string;
  updated_at?:  string;
  picked?:      boolean;
  picked_at?:   string | null;
  next_run_at?: string | null;
  retry_count?: number;
}

// ── Normaliser — raw backend shape → UI Campaign model ────────────────────────

function toCampaign(r: RawCampaign): Campaign {
  /* ── Channel ──
     The backend may return channel as:
       a) an object  { type: "push", message: { title, body, deep_link } }
       b) a string   "push"   (with message at top level or in r.message)
     We try all three paths so neither format is missed.
  */
  const ch      = typeof r.channel === 'object' && r.channel !== null ? r.channel : null;
  const chType  = (ch?.type ?? (typeof r.channel === 'string' ? r.channel : 'push')) as CampaignChannel;

  // Resolve message from most-specific to least-specific:
  //   1. channel.message  (POST/PATCH request format echoed back)
  //   2. r.message        (top-level message object)
  //   3. r.notification   (common alternative key)
  //   4. r.title / r.body / r.deep_link  (fully-flattened response)
  const rAny    = r as Record<string, any>;
  const message =
    ch?.message         ??
    r.message           ??
    rAny['notification'] ??
    undefined;

  const msgTitle    = message?.title     ?? r.title     ?? rAny['notification_title'];
  const msgBody     = message?.body      ?? r.body      ?? rAny['notification_body'] ?? rAny['content'];
  const msgDeepLink = message?.deep_link ?? r.deep_link ?? rAny['deeplink'];

  /* ── Schedule ── */
  const sc       = r.trigger?.schedule;
  const scType   = sc?.type ?? 'immediate';    // 'immediate' | 'once' | 'daily' | 'weekly' | 'monthly'

  let schedule: CampaignSchedule | undefined;
  if (scType === 'immediate') {
    schedule = { schedule_type: 'one_time', execution_type: 'asap' };
  } else if (scType === 'once') {
    const dt = sc?.start_date
      ? `${sc.start_date}T${sc.schedule_time ?? '00:00'}`
      : sc?.send_at ?? r.trigger?.send_at ?? '';
    schedule = { schedule_type: 'one_time', execution_type: 'specific_datetime', datetime: dt, timezone: sc?.timezone };
  } else if (scType) {
    // periodic: daily | weekly | monthly
    schedule = {
      schedule_type: 'periodic',
      frequency:     scType as PeriodicType,
      start_date:    sc?.start_date,
      end_date:      sc?.end_date,
      trigger_time:  sc?.schedule_time,
      timezone:      sc?.timezone,
      days:          sc?.days_of_week,
      dates:         sc?.days_of_month,
    };
  }

  /* ── Delivery controls ── */
  const del  = r.delivery;
  const rl   = del?.rate_limit ?? r.rate_limit;
  const dly  = del?.delay      ?? r.delay;
  const delivery_controls: CampaignDeliveryControls = {
    max_frequency:                rl?.per_user_per_day,
    per_user_per_campaign_total:  rl?.per_user_per_campaign_total,
    min_delay:                    dly?.minutes ?? del?.min_delay_between_sends_minutes,
    min_delay_unit:               'Mins',
    ignore_global_delay:          del?.ignore_global_min_delay ?? false,
    auto_dismiss_after:           del?.auto_dismiss?.dismiss_after_seconds,
  };

  return {
    id:          r.campaign_id,
    name:        r.name,
    status:      r.status,
    channel:     chType,
    template_id: ch?.template_id ?? undefined,
    objective:   r.objective,
    tags:        r.tags ? r.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    // Trigger
    trigger_type:       r.trigger?.type,
    trigger_event_name: r.trigger?.event_name,
    // Audience
    segment_id:    r.audience?.segment_id,
    platforms:     r.audience?.target_platforms ?? [],
    audience_all:  r.audience?.all,
    // Push content — resolved from channel.message, r.message, or top-level fields
    title:      msgTitle,
    content:    msgBody,
    deep_link:  msgDeepLink,
    // Schedule & delivery
    schedule,
    delivery_controls,
    // Meta
    last_activity: r.updated_at ?? r.created_at,
    created_at:    r.created_at,
    updated_at:    r.updated_at,
    picked:        r.picked,
    retry_count:   r.retry_count,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * The backend GET/POST response often omits push-content fields (title, body,
 * deep_link) that were submitted in the request payload.  This function merges
 * whatever the API returned with the last-known payload so nothing is lost in
 * the Redux store.
 */
function mergePayload(from: Campaign, payload: Partial<CampaignPayload>): Campaign {
  return {
    ...from,
    name:              payload.name        ?? from.name,
    objective:         payload.objective   ?? from.objective,
    tags:              payload.tags        ?? from.tags,
    platforms:         payload.platforms   ?? from.platforms,
    segment_id:        payload.segment_id  ?? from.segment_id,
    segment_name:      payload.segment_name?? from.segment_name,
    // Push notification content — critical: always prefer payload over response
    title:             payload.title       ?? from.title,
    content:           payload.content     ?? from.content,
    deep_link:         payload.deep_link   ?? from.deep_link,
    schedule:          payload.schedule    ?? from.schedule,
    delivery_controls: payload.delivery_controls ?? from.delivery_controls,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function fetchCampaigns(projectId: string): Promise<Campaign[]> {
  const res = await fetch(`${CAMPAIGN_ROOT}/${projectId}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchCampaigns failed: ${res.status}`);
  const data = await res.json();
  const raw: RawCampaign[] = Array.isArray(data) ? data : (data.campaigns ?? data.results ?? []);
  return raw.map(toCampaign);
}

export async function getCampaign(projectId: string, campaignId: string): Promise<Campaign> {
  const res = await fetch(`${CAMPAIGN_ROOT}/${projectId}/${campaignId}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getCampaign failed: ${res.status}`);
  return toCampaign(await res.json());
}

export async function createCampaign(projectId: string, payload: CampaignPayload): Promise<Campaign> {
  const body = toApiPayload(payload);
  const res = await fetch(`${CAMPAIGN_ROOT}/${projectId}`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createCampaign failed: ${res.status}`);
  // Merge payload back — API response is usually minimal (just campaign_id)
  return mergePayload(toCampaign(await res.json()), payload);
}

export async function updateCampaign(projectId: string, campaignId: string, payload: Partial<CampaignPayload>): Promise<Campaign> {
  const body = toApiPayload(payload);
  const res = await fetch(`${CAMPAIGN_ROOT}/${projectId}/${campaignId}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateCampaign failed: ${res.status}`);
  // Merge payload back — API response may not echo content fields
  return mergePayload(toCampaign(await res.json()), payload);
}

export async function deleteCampaign(projectId: string, campaignId: string): Promise<void> {
  const res = await fetch(`${CAMPAIGN_ROOT}/${projectId}/${campaignId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`deleteCampaign failed: ${res.status}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMinutes(value: number, unit: string): number {
  if (unit === 'Hours') return value * 60;
  if (unit === 'Days')  return value * 1440;
  return value; // default: Mins
}

// ── UI → API payload serialiser ───────────────────────────────────────────────

function toApiPayload(p: Partial<CampaignPayload>): Record<string, unknown> {
  const sc = p.schedule as (CampaignSchedule & { execution_type?: string; frequency?: string; trigger_time?: string; days?: string[]; dates?: number[] }) | undefined;

  /* ── Trigger / schedule ── */
  const isAsap = sc?.schedule_type === 'one_time' && (sc?.execution_type === 'asap' || !sc?.execution_type);

  let scheduleType = 'immediate';
  const scheduleConfig: Record<string, unknown> = {};

  if (sc?.schedule_type === 'one_time') {
    if (isAsap) {
      scheduleType = 'immediate';
    } else {
      // specific_datetime — send datetime as-is
      scheduleType = 'once';
      if (sc.datetime) {
        scheduleConfig.send_at       = sc.datetime;
        const [date, timeRaw]        = sc.datetime.split('T');
        scheduleConfig.start_date    = date;
        scheduleConfig.schedule_time = (timeRaw ?? '').slice(0, 5);
      }
      scheduleConfig.timezone = sc.timezone;
    }
  } else if (sc?.schedule_type === 'periodic') {
    const freq = sc.frequency ?? sc.periodic_type ?? 'daily';
    scheduleType = freq;
    scheduleConfig.timezone      = sc.timezone;
    scheduleConfig.start_date    = sc.start_date  || undefined;
    scheduleConfig.end_date      = sc.end_date    || undefined;
    scheduleConfig.schedule_time = sc.trigger_time ?? '';
    if (freq === 'weekly'  && sc.days?.length)   scheduleConfig.days_of_week  = sc.days;
    if (freq === 'monthly' && sc.dates?.length)  scheduleConfig.days_of_month = sc.dates;
  }

  /* ── Channel / message ── */
  const channelObj: Record<string, unknown> = {
    type:        p.channel ?? 'push',
    template_id: p.template_id ?? null,
  };
  if (p.channel === 'push' || (!p.channel && p.title)) {
    channelObj.message = {
      title:     p.title     ?? '',
      body:      p.content   ?? '',
      deep_link: p.deep_link ?? '',
    };
  }

  return {
    name:      p.name      ?? '',
    tags:      Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags ?? ''),
    objective: p.objective ?? '',
    audience: {
      segment_id:      p.segment_id ?? '',
      target_platforms:p.platforms  ?? [],
    },
    trigger: {
      type:     "scheduled",
      // Build schedule explicitly — cron is server-computed, never sent in requests
      schedule: (() => {
        const s: Record<string, unknown> = { type: scheduleType };
        Object.entries(scheduleConfig).forEach(([k, v]) => {
          if (k !== 'cron' && v !== undefined) s[k] = v;
        });
        return s;
      })(),
    },
    channel: channelObj,
    delivery: {
      rate_limit: {
        // Send the exact value — 0 when toggle is off, user value when toggle is on
        per_user_per_day:            p.delivery_controls?.max_frequency        ?? 0,
        per_user_per_campaign_total: p.delivery_controls?.per_user_per_campaign_total || null,
      },
      delay: {
        minutes: toMinutes(
          p.delivery_controls?.min_delay       ?? 0,
          p.delivery_controls?.min_delay_unit  ?? 'Mins',
        ),
      },
      min_delay_between_sends_minutes: toMinutes(
        p.delivery_controls?.min_delay      ?? 0,
        p.delivery_controls?.min_delay_unit ?? 'Mins',
      ),
      ignore_global_min_delay: p.delivery_controls?.ignore_global_delay ?? false,
      auto_dismiss: {
        dismiss_after_seconds: p.delivery_controls?.auto_dismiss_after ?? 60,
      },
    },
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function campaignAction(projectId: string, campaignId: string, action: string): Promise<Campaign> {
  const res = await fetch(`${CAMPAIGN_ROOT}/${projectId}/${campaignId}/${action}`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`${action} campaign failed: ${res.status}`);
  return toCampaign(await res.json());
}

export const activateCampaign = (pid: string, cid: string) => campaignAction(pid, cid, "activate");
export const pauseCampaign    = (pid: string, cid: string) => campaignAction(pid, cid, "pause");
export const resumeCampaign   = (pid: string, cid: string) => campaignAction(pid, cid, "resume");
export const cancelCampaign   = (pid: string, cid: string) => campaignAction(pid, cid, "cancel");
