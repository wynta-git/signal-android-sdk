import { getToken } from 'wynta-react-common/services/tokenRegistry';

const BASE = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL || "http://3.7.48.14:8004";

function campaignRoot(projectId: string): string {
  return `${BASE}/api/v1/campaign/projects/${projectId}`;
}

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
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

// ── In-app template (variants) ──────────────────────────────────────────────

export interface Media {
  image_url?:          string;
  background_color?:   string;
  background_opacity?: 'opaque' | 'translucent' | 'transparent';
}

export interface Cta {
  role:   'primary' | 'secondary';
  label:  string;
  action: 'deep_link' | 'external_url' | 'dismiss';
  value?: string;   // required unless action === 'dismiss'
}

export type InAppTemplateType =
  | 'modal' | 'popup_image' | 'rating' | 'fullscreen' | 'nudge'
  | 'carousel' | 'survey' | 'lead_gen' | 'gamification' | 'html_nudge';

export interface Variant {
  variant_id?:              string;    // server-generated if omitted
  weight:                   number;    // 0-100, all variants must sum to 100
  template_type:            InAppTemplateType;
  render_engine:            'native' | 'html';
  title?:                   string;
  body?:                    string;
  media?:                   Media;
  cta:                      Cta[];
  close_button_visibility:  string;    // only "always" is confirmed for now
  /* Shape depends on template_type — see docs/event-schema equivalent on the
     backend (services/campaign-engine/app/models.py). Kept as a loose record
     here (mirrors the backend's `dict | null`) rather than a discriminated
     union, since the UI narrows on template_type itself. */
  layout?:                  Record<string, any> | null;
  web_view_url?:            string;    // optional — SDK loads a webview instead of native rendering
}

export interface InAppTemplate {
  name?:    string;
  variants: Variant[];
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
  // in_app only — screen names to show on when trigger_criteria is
  // 'on_screen_load'. undefined/omitted otherwise.
  target_screens?:      string[];
  // in_app only — event names that show the notification (any-of) when
  // trigger_criteria is 'on_custom_event'. undefined/omitted otherwise.
  target_events?:       string[];
  // in_app only — hours until a delivered notification stops appearing in the
  // inbox even if unread. undefined/omitted = never expires.
  expires_in_hours?:    number;
  // Audience / Segment
  segment_id?:          string;
  segment_name?:        string;
  audience_all?:        boolean;
  // Push notification content
  title?:               string;
  content?:             string;
  deep_link?:           string;
  // Email content (email channel only) — subject/HTML plain textarea inputs,
  // no rich-text editor. HTML may contain both real Jinja2 ({{ project.x }},
  // shared across all recipients) and literal -user.x-/-ctx.x-/
  // -unsubscribe_url- substitution tokens (per-recipient, filled in by
  // SendGrid at send time) — see notifications-engine's render_email_shared.
  email_subject?:       string;
  email_html?:          string;
  email_text?:          string;
  // Rich content blocks (non-push channels)
  content_blocks?:      ContentBlock[];
  // In-app template variants (in_app channel only)
  variants?:            Variant[];
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
  // Top-level trigger_type (in_app channel only) — sibling of `trigger`,
  // e.g. "on_session_start" | "on_screen_load" | "on_custom_event".
  trigger_type?: string;
  // in_app only — sibling of trigger_type above, populated when trigger_type
  // is "on_screen_load".
  target_screens?: string[] | null;
  // in_app only — sibling of trigger_type above, populated when trigger_type
  // is "on_custom_event".
  target_events?: string[] | null;
  // in_app only — sibling of trigger_type above, same "top-level, not nested" shape.
  expires_in_hours?: number | null;
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
  // In-app template — top-level `variants` on the response doc (per
  // campaign-engine's GET /campaign/.../:id route) when a channel.template
  // was set on create/update.
  variants?: Variant[];
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

  // Email content — campaign-engine's GET route echoes the resolved template
  // body back as `doc.message` for every channel (not just push), so for
  // channel="email" that same `message` object actually holds
  // {subject, html, text} rather than {title, body, deep_link}.
  const emailSubject = chType === 'email' ? (message?.subject as string | undefined) : undefined;
  const emailHtml    = chType === 'email' ? (message?.html    as string | undefined) : undefined;
  const emailText    = chType === 'email' ? (message?.text    as string | undefined) : undefined;

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
    // in_app trigger selector (on_session_start | on_screen_load | on_custom_event) —
    // sent/returned as a top-level `trigger_type` field, distinct from `trigger.type` above.
    trigger_criteria:   (r.trigger_type as TriggerCriteria) ?? undefined,
    target_screens:     r.target_screens ?? undefined,
    target_events:      r.target_events ?? undefined,
    expires_in_hours:   r.expires_in_hours ?? undefined,
    // Audience
    segment_id:    r.audience?.segment_id,
    platforms:     r.audience?.target_platforms ?? [],
    audience_all:  r.audience?.all,
    // Push content — resolved from channel.message, r.message, or top-level fields
    title:      msgTitle,
    content:    msgBody,
    deep_link:  msgDeepLink,
    // Email content (email channel only) — resolved from the same `message`
    // object above, which for channel="email" actually holds {subject,html,text}
    email_subject: emailSubject,
    email_html:    emailHtml,
    email_text:    emailText,
    // In-app template variants (in_app channel only)
    variants:   r.variants ?? undefined,
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
    trigger_criteria:  payload.trigger_criteria ?? from.trigger_criteria,
    target_screens:    payload.target_screens   ?? from.target_screens,
    target_events:     payload.target_events    ?? from.target_events,
    expires_in_hours:  payload.expires_in_hours ?? from.expires_in_hours,
    // Push notification content — critical: always prefer payload over response
    title:             payload.title       ?? from.title,
    content:           payload.content     ?? from.content,
    deep_link:         payload.deep_link   ?? from.deep_link,
    // Email content — same rationale as push content above
    email_subject:     payload.email_subject ?? from.email_subject,
    email_html:        payload.email_html    ?? from.email_html,
    email_text:        payload.email_text    ?? from.email_text,
    // In-app template variants — same rationale as push content above
    variants:          payload.variants    ?? from.variants,
    schedule:          payload.schedule    ?? from.schedule,
    delivery_controls: payload.delivery_controls ?? from.delivery_controls,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function fetchCampaigns(projectId: string, brandId?: number): Promise<Campaign[]> {
  const root = campaignRoot(projectId);
  const url = brandId ? `${root}?brand_id=${brandId}` : root;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchCampaigns failed: ${res.status}`);
  const data = await res.json();
  const raw: RawCampaign[] = Array.isArray(data) ? data : (data.campaigns ?? data.results ?? []);
  return raw.map(toCampaign);
}

export async function getCampaign(projectId: string, campaignId: string): Promise<Campaign> {
  const res = await fetch(`${campaignRoot(projectId)}/${campaignId}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getCampaign failed: ${res.status}`);
  return toCampaign(await res.json());
}

export async function createCampaign(projectId: string, payload: CampaignPayload, brandId?: number): Promise<Campaign> {
  const body = toApiPayload(payload);
  if (brandId) body.brand_id = String(brandId);
  const res = await fetch(campaignRoot(projectId), {
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
  const res = await fetch(`${campaignRoot(projectId)}/${campaignId}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateCampaign failed: ${res.status}`);
  // Merge payload back — API response may not echo content fields
  return mergePayload(toCampaign(await res.json()), payload);
}

/**
 * Uploads an image file (for in_app notification media) to S3 via campaign-engine
 * and returns the public URL. Mirrors wynta-react-common/services/segmentApi.ts's
 * multipart pattern — no Content-Type header, the browser sets the boundary itself.
 */
export async function uploadCampaignImage(projectId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${campaignRoot(projectId)}/uploads/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`uploadCampaignImage failed: ${res.status}`);
  const data = await res.json();
  return data.image_url as string;
}

/**
 * Fetches the marketer-configured "on_screen_load" target screen catalog
 * (campaign-engine's screen_catalog collection, Redis-cached). Optionally
 * scoped to a brand — returns brand-specific + project-wide screens.
 */
export async function fetchScreenCatalog(projectId: string, brandId?: number): Promise<string[]> {
  const url = brandId
    ? `${campaignRoot(projectId)}/screens?brand_id=${brandId}`
    : `${campaignRoot(projectId)}/screens`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchScreenCatalog failed: ${res.status}`);
  const data = await res.json();
  return data.screens as string[];
}

/**
 * Adds a screen name to the catalog (project-wide, or scoped to `brandId` if
 * given), returning the refreshed catalog. Adding a name that already exists
 * is a no-op on the backend (unique-index upsert), not an error.
 */
export async function createScreen(projectId: string, screenName: string, brandId?: number): Promise<string[]> {
  const res = await fetch(`${campaignRoot(projectId)}/screens`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ screen_name: screenName, ...(brandId ? { brand_id: String(brandId) } : {}) }),
  });
  if (!res.ok) throw new Error(`createScreen failed: ${res.status}`);
  const data = await res.json();
  return data.screens as string[];
}

export async function deleteScreen(projectId: string, screenName: string, brandId?: number): Promise<string[]> {
  const url = brandId
    ? `${campaignRoot(projectId)}/screens/${encodeURIComponent(screenName)}?brand_id=${brandId}`
    : `${campaignRoot(projectId)}/screens/${encodeURIComponent(screenName)}`;
  const res = await fetch(url, { method: 'DELETE', headers: authHeader() });
  if (!res.ok) throw new Error(`deleteScreen failed: ${res.status}`);
  const data = await res.json();
  return data.screens as string[];
}

export interface ScreenCatalogEntry { screen_name: string; brand_id: string | null; }

/**
 * Full catalog entries (name + scope) for the Screen Catalog admin page —
 * unlike `fetchScreenCatalog`'s cached/deduplicated flat list (the wizard's
 * autocomplete), this always reads live so add/edit/delete show up
 * immediately.
 */
export async function fetchScreenCatalogDetailed(projectId: string, brandId?: number): Promise<ScreenCatalogEntry[]> {
  const url = brandId
    ? `${campaignRoot(projectId)}/screens/detailed?brand_id=${brandId}`
    : `${campaignRoot(projectId)}/screens/detailed`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchScreenCatalogDetailed failed: ${res.status}`);
  const data = await res.json();
  return data.screens as ScreenCatalogEntry[];
}

export async function deleteCampaign(projectId: string, campaignId: string): Promise<void> {
  const res = await fetch(`${campaignRoot(projectId)}/${campaignId}`, {
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
  if (p.channel === 'in_app') {
    // in_app never uses `message` — it carries a full multi-variant template
    // nested under channel.template, mutually exclusive with template_id/message.
    channelObj.template = {
      name:     p.name ?? '',
      variants: p.variants ?? [],
    } satisfies InAppTemplate;
  } else if (p.channel === 'push' || (!p.channel && p.title)) {
    channelObj.message = {
      title:     p.title     ?? '',
      body:      p.content   ?? '',
      deep_link: p.deep_link ?? '',
    };
  } else if (p.channel === 'email') {
    channelObj.email = {
      subject: p.email_subject ?? '',
      html:    p.email_html    ?? '',
      ...(p.email_text ? { text: p.email_text } : {}),
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
    // in_app trigger selector — top-level field, sibling of `trigger` above
    // (NOT nested inside it). Only meaningful for the in_app channel today.
    ...(p.channel === 'in_app' && p.trigger_criteria ? { trigger_type: p.trigger_criteria } : {}),
    // in_app screen targeting — only meaningful (and only sent) when the
    // trigger selector above is 'on_screen_load'.
    ...(p.channel === 'in_app' && p.trigger_criteria === 'on_screen_load' && p.target_screens?.length
      ? { target_screens: p.target_screens }
      : {}),
    // in_app event targeting — only meaningful (and only sent) when the
    // trigger selector above is 'on_custom_event'.
    ...(p.channel === 'in_app' && p.trigger_criteria === 'on_custom_event' && p.target_events?.length
      ? { target_events: p.target_events }
      : {}),
    // in_app notification expiry — same top-level, sibling-of-trigger shape.
    ...(p.channel === 'in_app' && p.expires_in_hours != null ? { expires_in_hours: p.expires_in_hours } : {}),
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
  const res = await fetch(`${campaignRoot(projectId)}/${campaignId}/${action}`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`${action} campaign failed: ${res.status}`);
  return toCampaign(await res.json());
}

export const activateCampaign = (projectId: string, cid: string) => campaignAction(projectId, cid, "activate");
export const pauseCampaign    = (projectId: string, cid: string) => campaignAction(projectId, cid, "pause");
export const resumeCampaign   = (projectId: string, cid: string) => campaignAction(projectId, cid, "resume");
export const cancelCampaign   = (projectId: string, cid: string) => campaignAction(projectId, cid, "cancel");
