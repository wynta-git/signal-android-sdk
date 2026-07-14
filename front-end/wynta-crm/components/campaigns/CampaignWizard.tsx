'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import Icon from 'wynta-react-common/components/Icon';
import { useCommonSelector } from 'wynta-react-common/store/hooks';
import { selectProjectId } from 'wynta-react-common/store/slices/usersSlice';
import {
  fetchSegments,
  selectAllSegments,
  selectSegmentsStatus,
  evaluateSegment,
} from 'wynta-react-common/store/slices/segmentsSlice';
import type { Segment } from 'wynta-react-common/types';
import AddSegmentModal from 'wynta-react-common/components/segments/AddSegmentModal';
import { createCampaign, updateCampaign, activateCampaign } from '../../store/slices/campaignsSlice';
import type {
  Campaign, CampaignPayload, CampaignChannel, TriggerCriteria,
  CampaignSchedule, CampaignDeliveryControls, ContentBlock,
  Variant, Cta, Media, InAppTemplateType,
} from '../../services/campaignApi';

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function channelLabel(ch: string) {
  const m: Record<string, string> = {
    push: 'Push', email: 'Email', sms: 'SMS',
    in_app: 'In-App', on_site: 'On-Site', cards: 'Cards',
    whatsapp: 'WhatsApp', telegram: 'Telegram', rcs: 'RCS',
  };
  return m[ch] ?? ch;
}

const OBJECTIVES = ['Retention', 'Acquisition', 'Promotion', 'Re-engagement', 'Onboarding', 'Monetisation'];
const TIMEZONES  = [
  'UTC',
  // Americas
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'America/Buenos_Aires',
  // Europe
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Europe/Istanbul',
  // Africa
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  // Middle East
  'Asia/Dubai',
  'Asia/Riyadh',
  // Asia
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Colombo',
  'Asia/Kathmandu',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Seoul',
  'Asia/Tokyo',
  // Oceania
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Perth',
  'Pacific/Auckland',
];

/* ------------------------------------------------------------------ */
/* Step-1 state type                                                    */
/* ------------------------------------------------------------------ */
interface Step1State {
  name:               string;
  tags:               string;
  objective:          string;
  platforms:          string[];
  trigger_criteria:   TriggerCriteria;
  expires_in_hours:   string;   // in_app only — blank = never expires
  segment_id:         string;   // selected segment ID
  segment_name:       string;
  segment_conditions: unknown;
  estimated_reach:    number;
  global_control:     boolean;
  campaign_control:   boolean;
  bonus_offer_enabled:     boolean;
  bonus_selected:          string;
  bonus_engine_integrated: boolean;
  bonus_section_enabled:   boolean;
}

const DEFAULT_S1: Step1State = {
  name: '', tags: '', objective: 'Retention',
  platforms: ['android', 'ios'],
  trigger_criteria: 'on_session_start',
  expires_in_hours: '',
  segment_id: '', segment_name: '', segment_conditions: null,
  estimated_reach: 0,
  global_control: true, campaign_control: false,
  bonus_offer_enabled: true, bonus_selected: '',
  bonus_engine_integrated: true, bonus_section_enabled: true,
};

/* ------------------------------------------------------------------ */
/* Step-2 state type (message builder + push-specific fields)          */
/* ------------------------------------------------------------------ */
interface Step2State {
  blocks:      ContentBlock[];
  push_title:     string;
  push_content:   string;
  push_deep_link: string;
  in_app_variants: Variant[];
}

const DEFAULT_BLOCK = (type: ContentBlock['type']): ContentBlock => ({
  id: `${type}-${Date.now()}`, type, data: {},
});

/* ------------------------------------------------------------------ */
/* In-app template — variant defaults & per-type layout shapes        */
/* ------------------------------------------------------------------ */
const IN_APP_FLAT_TYPES = new Set<InAppTemplateType>(['modal', 'popup_image', 'fullscreen', 'nudge']);

/* Loose local shapes for the layout editors below — the wire contract is a
   plain dict (see Variant['layout'] in campaignApi.ts); these interfaces
   exist purely so the authoring UI can narrow on template_type. */
interface CarouselSlide     { image_url?: string; title?: string; body?: string; }
interface CarouselLayout    { slides: CarouselSlide[]; }
interface SurveyQuestion    { question_text: string; options: string[]; }
interface SurveyLayout      { questions: SurveyQuestion[]; }
interface LeadGenField      { name: string; type: 'text' | 'email' | 'phone' | 'number'; required: boolean; }
interface LeadGenSubmit     { action: string; value?: string; }
interface LeadGenLayout     { fields: LeadGenField[]; submit_action: LeadGenSubmit; }
interface GamificationSeg   { label: string; value: string; }
interface GamificationLayout{ game_type: string; segments: GamificationSeg[]; }
interface RatingLayout      { max_stars: number; prompt: string; }
interface HtmlNudgeLayout   { html?: string; hosted_url?: string; }

function defaultLayoutFor(type: InAppTemplateType): Record<string, any> | null {
  switch (type) {
    case 'carousel':     return { slides: [{ image_url: '', title: '', body: '' }] } as CarouselLayout;
    case 'survey':       return { questions: [{ question_text: '', options: [''] }] } as SurveyLayout;
    case 'lead_gen':     return { fields: [{ name: '', type: 'text', required: false }], submit_action: { action: 'dismiss', value: '' } } as LeadGenLayout;
    case 'gamification': return { game_type: '', segments: [{ label: '', value: '' }] } as GamificationLayout;
    case 'rating':       return { max_stars: 5, prompt: '' } as RatingLayout;
    case 'html_nudge':   return { html: '', hosted_url: '' } as HtmlNudgeLayout;
    default:             return null;
  }
}

const DEFAULT_VARIANT = (): Variant => ({
  variant_id:              `var_${Math.random().toString(36).slice(2, 8)}`,
  weight:                  100,
  template_type:           'modal',
  render_engine:           'native',
  title:                   '',
  body:                    '',
  media:                   {},
  cta:                     [{ role: 'primary', label: '', action: 'dismiss', value: '' }],
  close_button_visibility: 'always',
  layout:                  null,
  web_view_url:            '',
});

/* ------------------------------------------------------------------ */
/* Step-3 state type                                                    */
/* ------------------------------------------------------------------ */
interface Step3State {
  // ── Schedule ───────────────────────────────
  schedule_type:   'one_time' | 'periodic';
  // One-time
  one_time_type:   'asap' | 'specific_datetime';
  datetime:        string;   // ISO datetime string
  // Periodic
  frequency:       'daily' | 'weekly' | 'monthly';
  start_date:      string;
  end_date:        string;
  trigger_time:    string;   // HH:MM (24-h)
  timezone:        string;
  // Weekly
  days:            string[]; // ['MON', 'WED', ...]
  // Monthly
  dates_input:     string;   // raw: "5,10,15,25"
  dates_error:     string;
  // ── Delivery controls ──────────────────────
  enable_rate_limit:   boolean;   // row 1
  max_frequency:       string;
  enable_min_delay:    boolean;   // row 2
  min_delay:           string;
  min_delay_unit:      string;
  ignore_global_delay: boolean;   // row 3
  enable_auto_dismiss: boolean;   // row 4
  auto_dismiss_after:  string;
}

const DEFAULT_S3: Step3State = {
  schedule_type:  'one_time',
  one_time_type:  'asap',
  datetime:       '',
  frequency:      'daily',
  start_date:     '',
  end_date:       '',
  trigger_time:   '09:00',
  timezone:       'Asia/Kolkata',
  days:           [],
  dates_input:    '',
  dates_error:    '',
  enable_rate_limit:   true,
  max_frequency:       '1',
  enable_min_delay:    true,
  min_delay:           '15',
  min_delay_unit:      'Mins',
  ignore_global_delay: false,
  enable_auto_dismiss: true,
  auto_dismiss_after:  '60',
};

/* ------------------------------------------------------------------ */
/* Props                                                                */
/* ------------------------------------------------------------------ */
interface Props {
  channel:    string;
  campaign?:  Campaign;       // when editing / viewing
  viewMode?:  boolean;        // true → read-only; only Cancel + Next/Back visible
  onClose:    () => void;
  onSaved:    () => void;
  brandId?:   number;
}

/* ------------------------------------------------------------------ */
/* Main Wizard Component                                                */
/* ------------------------------------------------------------------ */
export default function CampaignWizard({ channel, campaign, viewMode = false, onClose, onSaved, brandId }: Props) {
  const dispatch   = useDispatch<any>();
  const projectId  = useCommonSelector(selectProjectId) ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';
  const isEdit     = !!campaign?.id;
  const [step, setStep]         = useState(1);
  const [saving, setSaving]     = useState(false);
  /** ID returned after first create — used for subsequent PATCH calls */
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(campaign?.id ?? null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  /* Bumped only on a failed Next/Submit attempt — the step components use this
     (not `fieldErrors` itself) to trigger the scroll/focus jump, so clearing
     an error as the user types doesn't yank focus to the next error field. */
  const [errorTick, setErrorTick] = useState(0);

  /* Init from existing campaign — edit/view: use only API data, no fallbacks */
  const [s1, setS1] = useState<Step1State>(() => campaign ? {
    name:               campaign.name               ?? '',
    tags:               campaign.tags?.join(', ')   ?? '',
    objective:          campaign.objective           ?? '',   // blank if API omits it
    platforms:          campaign.platforms           ?? [],   // empty if API omits it
    trigger_criteria:   campaign.trigger_criteria   ?? 'on_session_start',
    expires_in_hours:   campaign.expires_in_hours != null ? String(campaign.expires_in_hours) : '',
    segment_id:         campaign.segment_id         ?? '',
    segment_name:       campaign.segment_name       ?? '',
    segment_conditions: null,
    estimated_reach:    0,
    global_control:     false,   // off until API confirms it
    campaign_control:   false,
    bonus_offer_enabled:     false,
    bonus_selected:          '',
    bonus_engine_integrated: false,
    bonus_section_enabled:   false,
  } : DEFAULT_S1);

  const [s2, setS2] = useState<Step2State>(() => ({
    blocks:         campaign?.content_blocks ?? [DEFAULT_BLOCK('heading'), DEFAULT_BLOCK('cta_button')],
    push_title:     campaign?.title     ?? '',
    push_content:   campaign?.content   ?? '',
    push_deep_link: campaign?.deep_link ?? '',
    in_app_variants: campaign?.variants?.length ? campaign.variants : [DEFAULT_VARIANT()],
  }));

  /* Sync s2 push fields / in-app variants whenever campaign prop delivers
     content. Handles the case where toCampaign returns title/content/
     deep_link/variants after the initial mount (or lazy-init ran before
     the prop was set). */
  useEffect(() => {
    if (!campaign) return;
    const hasContent  = campaign.title || campaign.content || campaign.deep_link;
    const hasVariants = campaign.variants && campaign.variants.length > 0;
    if (!hasContent && !hasVariants) return;
    setS2(prev => ({
      ...prev,
      push_title:      campaign.title     ?? prev.push_title,
      push_content:    campaign.content   ?? prev.push_content,
      push_deep_link:  campaign.deep_link ?? prev.push_deep_link,
      in_app_variants: hasVariants ? campaign.variants! : prev.in_app_variants,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id]); // re-run only when a different campaign is loaded

  const [s3, setS3] = useState<Step3State>(() => {
    const dc = campaign?.delivery_controls;
    const sc = campaign?.schedule as any;
    if (sc) {
      const st: 'one_time' | 'periodic' = sc.schedule_type ?? sc.type ?? 'one_time';
      return {
        schedule_type:  st,
        one_time_type:  sc.execution_type ?? (sc.send_at ? 'specific_datetime' : 'asap'),
        datetime:       sc.datetime ?? sc.send_at ?? '',
        frequency:      sc.frequency ?? sc.periodic_type ?? 'daily',
        start_date:     sc.start_date ?? '',
        end_date:       sc.end_date   ?? '',
        trigger_time:   sc.trigger_time ?? '09:00',
        timezone:       sc.timezone   ?? 'Asia/Kolkata',
        days:           sc.days       ?? [],
        dates_input:    (sc.dates ?? []).join(','),
        dates_error:    '',
        enable_rate_limit:   true,
        max_frequency:       String(dc?.max_frequency  ?? 1),
        enable_min_delay:    dc?.min_delay          != null,
        min_delay:           String(dc?.min_delay      ?? '15'),
        min_delay_unit:      dc?.min_delay_unit        ?? 'Mins',
        ignore_global_delay: dc?.ignore_global_delay ?? false,
        enable_auto_dismiss: dc?.auto_dismiss_after  != null,
        auto_dismiss_after:  String(dc?.auto_dismiss_after ?? '60'),
      };
    }
    return DEFAULT_S3;
  });

  /* ESC */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  /* ── Build API payload ── */
  function buildPayload(asDraft = false): CampaignPayload {
    const isPush  = channel === 'push';
    const isInApp = channel === 'in_app';

    /* ── Schedule payload ── */
    let schedule: CampaignSchedule;
    if (s3.schedule_type === 'one_time') {
      schedule = {
        schedule_type:  'one_time',
        execution_type: s3.one_time_type,
        ...(s3.one_time_type === 'specific_datetime' && {
          datetime: s3.datetime,
          timezone: s3.timezone,
        }),
      };
    } else {
      const base = {
        schedule_type: 'periodic' as const,
        frequency:     s3.frequency,
        start_date:    s3.start_date  || undefined,
        end_date:      s3.end_date    || undefined,
        trigger_time:  s3.trigger_time,
        timezone:      s3.timezone,
      };
      if (s3.frequency === 'weekly') {
        schedule = { ...base, days: s3.days };
      } else if (s3.frequency === 'monthly') {
        const dates = parseDates(s3.dates_input).valid;
        schedule = { ...base, dates };
      } else {
        schedule = base;
      }
    }

    /* Delivery controls — toggle OFF sends 0, toggle ON sends the entered value */
    const delivery: CampaignDeliveryControls = {
      max_frequency:      s3.enable_rate_limit  ? (Number(s3.max_frequency) || 1) : 0,
      ...(!isPush ? {
        min_delay:        s3.enable_min_delay   ? (Number(s3.min_delay)     || 0) : 0,
        min_delay_unit:   s3.min_delay_unit,
        ignore_global_delay: s3.ignore_global_delay,
      } : {}),
      auto_dismiss_after: s3.enable_auto_dismiss ? (Number(s3.auto_dismiss_after) || 0) : 0,
    };

    return {
      name:             s1.name.trim(),
      channel:          channel as CampaignChannel,
      objective:        s1.objective,
      tags:             s1.tags ? s1.tags.split(',').map(t => t.trim()) : [],
      platforms:        s1.platforms,
      /* Push omits trigger_criteria */
      ...(isPush ? {} : { trigger_criteria: s1.trigger_criteria }),
      /* in_app only — blank input means "never expires" */
      ...(isInApp && s1.expires_in_hours.trim() ? { expires_in_hours: Number(s1.expires_in_hours) } : {}),
      segment_id:       s1.segment_id || undefined,
      segment_name:     s1.segment_name,
      /* Push-specific content fields / in-app template variants / block canvas */
      ...(isPush ? {
        title:     s2.push_title.trim()     || undefined,
        content:   s2.push_content.trim()   || undefined,
        deep_link: s2.push_deep_link.trim() || undefined,
      } : isInApp ? {
        variants: s2.in_app_variants,
      } : {
        content_blocks: s2.blocks,
      }),
      schedule,
      delivery_controls:delivery,
      status:           asDraft ? 'draft' : 'scheduled',
    };
  }

  /* ── Per-step required-field validation ── */
  type FieldError = { key: string; message: string };

  function getStep1Errors(): FieldError[] {
    const errs: FieldError[] = [];
    if (!s1.name.trim())           errs.push({ key: 'name',      message: 'Campaign name is required.' });
    if (s1.platforms.length === 0) errs.push({ key: 'platforms', message: 'Select at least one target platform.' });
    if (!s1.segment_id.trim())     errs.push({ key: 'segment',   message: 'Target segment is required.' });
    return errs;
  }

  function getStep2Errors(): FieldError[] {
    const errs: FieldError[] = [];
    if (channel === 'push') {
      if (!s2.push_title.trim())   errs.push({ key: 'push_title',   message: 'Push title is required.' });
      if (!s2.push_content.trim()) errs.push({ key: 'push_content', message: 'Push content is required.' });
    } else if (channel === 'in_app') {
      const variants = s2.in_app_variants ?? [];
      if (variants.length === 0) {
        errs.push({ key: 'in_app_variants', message: 'At least one variant is required.' });
      }
      const totalWeight = variants.reduce((sum, v) => sum + (Number(v.weight) || 0), 0);
      if (variants.length > 0 && totalWeight !== 100) {
        errs.push({ key: 'in_app_weights', message: `Variant weights must sum to exactly 100% (currently ${totalWeight}%).` });
      }
      variants.forEach((v, i) => {
        const label = `Variant ${i + 1}`;
        if (IN_APP_FLAT_TYPES.has(v.template_type)) {
          if (!v.title?.trim() || !v.body?.trim()) {
            errs.push({ key: `in_app_variant_${i}`, message: `${label}: title and body are required.` });
          }
        } else {
          const layout = v.layout as Record<string, any> | null;
          let layoutValid = false;
          switch (v.template_type) {
            case 'carousel':     layoutValid = !!layout?.slides?.length; break;
            case 'survey':       layoutValid = !!layout?.questions?.length; break;
            case 'lead_gen':     layoutValid = !!layout?.fields?.length; break;
            case 'gamification': layoutValid = !!layout?.segments?.length; break;
            case 'rating':       layoutValid = !!layout?.max_stars && !!String(layout?.prompt ?? '').trim(); break;
            case 'html_nudge': {
              const hasHtml = !!String(layout?.html ?? '').trim();
              const hasUrl  = !!String(layout?.hosted_url ?? '').trim();
              layoutValid   = hasHtml !== hasUrl; // exactly one
              break;
            }
          }
          if (!layoutValid) {
            errs.push({ key: `in_app_variant_${i}`, message: `${label}: ${v.template_type.replace('_', ' ')} layout content is required.` });
          }
        }
        const cta = v.cta ?? [];
        if (!cta.some(c => c.role === 'primary')) {
          errs.push({ key: `in_app_variant_${i}_cta`, message: `${label}: at least one primary CTA is required.` });
        }
        // Backend requires a non-empty `value` whenever action !== 'dismiss' —
        // catch it here so the user gets an inline message instead of a raw 422.
        cta.forEach(c => {
          if (c.action !== 'dismiss' && !c.value?.trim()) {
            const roleLabel = c.role === 'primary' ? 'Primary CTA' : 'Secondary CTA';
            errs.push({
              key: `in_app_variant_${i}_cta`,
              message: `${label}: ${roleLabel} needs a value (deep link / URL) since its action isn't "Dismiss".`,
            });
          }
        });
      });
    }
    return errs;
  }

  function getStep3Errors(): FieldError[] {
    const errs: FieldError[] = [];
    if (s3.schedule_type === 'one_time' && s3.one_time_type === 'specific_datetime') {
      if (!s3.datetime) errs.push({ key: 'datetime', message: 'Send date & time is required.' });
      if (!s3.timezone) errs.push({ key: 'timezone', message: 'Timezone is required.' });
    }
    if (s3.schedule_type === 'periodic') {
      if (!s3.start_date)    errs.push({ key: 'start_date',   message: 'Start date is required.' });
      if (!s3.trigger_time)  errs.push({ key: 'trigger_time', message: 'Trigger time is required.' });
      if (!s3.timezone)      errs.push({ key: 'timezone',     message: 'Timezone is required.' });
      if (s3.frequency === 'weekly' && s3.days.length === 0)
        errs.push({ key: 'days', message: 'Select at least one day of the week.' });
      if (s3.frequency === 'monthly') {
        const { valid, error } = parseDates(s3.dates_input);
        if (error)               errs.push({ key: 'dates', message: error });
        if (valid.length === 0)  errs.push({ key: 'dates', message: 'At least one valid date of month is required.' });
      }
    }
    return errs;
  }

  function validateForPublish(): FieldError[] {
    return [...getStep1Errors(), ...getStep2Errors(), ...getStep3Errors()];
  }

  /* Drop a field's error the moment its value becomes valid, so the red
     highlight disappears as soon as the user fixes it — no need to hit
     Next/Submit again to clear it. */
  useEffect(() => {
    if (fieldErrors.size === 0) return;
    const stillInvalid = new Set(validateForPublish().map(e => e.key));
    setFieldErrors(prev => {
      const next = new Set([...prev].filter(k => stillInvalid.has(k)));
      return next.size === prev.size ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s1, s2, s3]);

  function showNotif(type: 'success' | 'error', msg: string) {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 4000);
  }

  /* ── Save as Draft — POST (new) or PATCH (existing), no activate ── */
  async function handleSaveAsDraft() {
    if (!s1.name.trim()) {
      setFieldErrors(new Set(['name']));
      setErrorTick(t => t + 1);
      setStep(1);
      showNotif('error', 'Campaign name is required before saving.');
      return;
    }
    setFieldErrors(new Set());
    setValidationErrors([]);
    setSaving(true);
    try {
      const payload = buildPayload(true);
      let savedId = activeCampaignId;

      if (savedId) {
        /* PATCH /campaigns/{campaign_id} */
        await dispatch(updateCampaign({ projectId, campaignId: savedId, payload })).unwrap();
      } else {
        /* POST /campaigns */
        const result = await dispatch(createCampaign({ projectId, payload, brandId })).unwrap();
        savedId = result.id;
        setActiveCampaignId(savedId);
      }

      showNotif('success', 'Campaign saved as draft successfully.');
      /* Stay on the page so user can continue editing */
    } catch (err) {
      showNotif('error', err instanceof Error ? err.message : 'Failed to save campaign.');
    } finally {
      setSaving(false);
    }
  }

  /* ── Publish — POST/PATCH then activate ── */
  async function handlePublish() {
    const errs = validateForPublish();
    if (errs.length > 0) {
      const keys = new Set(errs.map(e => e.key));
      setFieldErrors(keys);
      setErrorTick(t => t + 1);
      setValidationErrors(errs.map(e => e.message));
      /* Jump back to the earliest step that has a missing field */
      if (keys.has('name') || keys.has('platforms') || keys.has('segment')) setStep(1);
      else if (keys.has('push_title') || keys.has('push_content') || [...keys].some(k => k.startsWith('in_app'))) setStep(2);
      return;
    }
    setFieldErrors(new Set());
    setValidationErrors([]);
    setSaving(true);
    try {
      const payload = buildPayload(false);
      let savedId = activeCampaignId;

      if (savedId) {
        /* PATCH /campaigns/{campaign_id} */
        await dispatch(updateCampaign({ projectId, campaignId: savedId, payload })).unwrap();
      } else {
        /* POST /campaigns */
        const result = await dispatch(createCampaign({ projectId, payload, brandId })).unwrap();
        savedId = result.id;
        setActiveCampaignId(savedId);
      }

      /* POST /campaigns/{campaign_id}/activate */
      await dispatch(activateCampaign({ projectId, campaignId: savedId! })).unwrap();

      showNotif('success', 'Campaign published successfully.');
      /* Redirect to list */
      setTimeout(() => onSaved(), 1200);
    } catch (err) {
      showNotif('error', err instanceof Error ? err.message : 'Failed to publish campaign.');
    } finally {
      setSaving(false);
    }
  }

  /* ── Next button — always clickable; validates the current step on click
     and highlights/focuses the first missing field instead of blocking ── */
  function handleNext() {
    const errs = step === 1 ? getStep1Errors() : getStep2Errors();
    if (errs.length > 0) {
      setFieldErrors(new Set(errs.map(e => e.key)));
      setErrorTick(t => t + 1);
      return;
    }
    setFieldErrors(new Set());
    setStep(s => s + 1);
  }

  /* Rendered inline inside .crm-content — no portal, sidebar stays visible */
  return (
    <div className="cwiz-page">

      {/* ── Breadcrumb ── */}
      <div className="cwiz-breadcrumb">
        <button type="button" className="cwiz-breadcrumb-link" onClick={onClose}>Campaigns</button>
        <Icon name="chevron-right" size={14} />
        <span>{viewMode ? 'View Campaign' : isEdit ? 'Edit Campaign' : 'Add Campaign'}</span>
      </div>

      {/* ── Steps progress ── */}
      <div className="cwiz-steps">
        {(['Target Segment', 'Content', 'Schedule & Goals'] as const).map((label, i) => {
          const n      = i + 1;
          const active = step === n;
          const done   = step > n;
          return (
            <div key={n} className={'cwiz-step' + (active ? ' active' : done ? ' done' : '')}>
              <div className="cwiz-step-circle">
                {done ? <Icon name="check" size={14} /> : n}
              </div>
              <span className="cwiz-step-label">{label}</span>
              {i < 2 && <div className="cwiz-step-line" />}
            </div>
          );
        })}
      </div>

      {/* ── Notifications ── */}
      {notification && (
        <div className={'cwiz-notif cwiz-notif--' + notification.type}>
          <Icon name={notification.type === 'success' ? 'check-circle' : 'alert-circle'} size={15} />
          {notification.msg}
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="cwiz-notif cwiz-notif--error cwiz-notif--list">
          <Icon name="alert-circle" size={15} />
          <ul>
            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── Scrollable step content ── */}
      <div className="cwiz-body">
        {step === 1 && <Step1 s={s1} onChange={setS1} channel={channel} errors={fieldErrors} errorTick={errorTick} />}
        {step === 2 && <Step2 s={s2} onChange={setS2} channel={channel} errors={fieldErrors} errorTick={errorTick} />}
        {step === 3 && <Step3 s={s3} onChange={setS3} channel={channel} errors={fieldErrors} errorTick={errorTick} />}
      </div>

      {/* ── Footer — width matches step-body content ── */}
      <div className="cwiz-footer">
        <div className="cwiz-footer-inner">
        <div className="cwiz-footer-left">
          {step > 1 && (
            <button type="button" className="cwiz-btn-back" onClick={() => { setFieldErrors(new Set()); setStep(s => s - 1); }}>
              ‹ Back
            </button>
          )}
        </div>
        <div className="cwiz-footer-right">
          <button type="button" className="asm-btn asm-btn--secondary" onClick={onClose}>Cancel</button>

          {/* Save as Draft — hidden in view mode */}
          {!viewMode && (
            <button type="button" className="asm-btn asm-btn--secondary" onClick={handleSaveAsDraft} disabled={saving}>
              Save as draft
            </button>
          )}

          {/* Next / Publish Campaign */}
          {step < 3 ? (
            <button
              type="button"
              className="asm-btn asm-btn--primary"
              onClick={() => (viewMode ? setStep(s => s + 1) : handleNext())}
            >
              Next ›
            </button>
          ) : viewMode ? (
            /* View mode last step — only Close */
            null
          ) : (
            <button type="button" className="asm-btn asm-btn--primary" onClick={handlePublish} disabled={saving}
              style={{ letterSpacing: 0.5, fontWeight: 700, gap: 6, paddingRight: 14 }}
            >
              {saving ? 'SUBMITTING…' : 'SUBMIT'}
              {!saving && <span style={{ fontSize: 15, lineHeight: 1, letterSpacing: -1 }}>»</span>}
            </button>
          )}
        </div>
        </div>{/* cwiz-footer-inner */}
      </div>
    </div>
  );
}

/* ================================================================== */
/* SegmentPicker — searchable dropdown + inline Add Segment modal     */
/* ================================================================== */
interface SegmentPickerProps {
  selectedId:   string;
  selectedName: string;
  onSelect:     (id: string, name: string) => void;
}

function segLabel(s: Segment): string {
  return s.label ?? s.name ?? String(s.id);
}

function SegmentPicker({ selectedId, selectedName, onSelect }: SegmentPickerProps) {
  const dispatch  = useDispatch<any>();
  const segments  = useCommonSelector(selectAllSegments);
  const segStatus = useCommonSelector(selectSegmentsStatus);

  useEffect(() => {
    if (segStatus === 'idle') dispatch(fetchSegments());
  }, [dispatch, segStatus]);

  const [open,       setOpen]       = useState(false);
  const [search,     setSearch]     = useState('');
  const [showAddSeg, setShowAddSeg] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? segments.filter(s => segLabel(s).toLowerCase().includes(q)) : [...segments];
    // Sort descending by last_refresh_time (last_used_at)
    return list.sort((a, b) => {
      const tA = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const tB = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return tB - tA;
    });
  }, [segments, search]);

  /* Display value: prefer live name from store, fall back to stored name */
  const liveSegment = segments.find(s => String(s.id) === selectedId);
  const displayValue = liveSegment ? segLabel(liveSegment) : selectedName;

  return (
    <>
      <div className="cwiz-seg-wrap" ref={wrapRef}>
        {/* Trigger row: dropdown trigger + Add Segment button */}
        <div className="cwiz-seg-row">
          <div
            className={'cwiz-seg-trigger' + (open ? ' open' : '')}
            role="combobox"
            aria-expanded={open}
            tabIndex={0}
            onClick={() => setOpen(o => !o)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
          >
            <span className={displayValue ? 'cwiz-seg-value' : 'cwiz-seg-placeholder'}>
              {displayValue || 'Search and select a segment…'}
            </span>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
          </div>
          <button
            type="button"
            className="cwiz-seg-add-btn"
            onClick={() => setShowAddSeg(true)}
          >
            <Icon name="plus" size={13} /> Add Segment
          </button>
        </div>

        {/* Dropdown list */}
        {open && (
          <div className="cwiz-seg-dropdown">
            <div className="cwiz-seg-search">
              <Icon name="search" size={13} color="var(--g400)" />
              <input
                autoFocus
                placeholder="Search segments…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setOpen(false); setSearch(''); }
                }}
              />
            </div>
            <div className="cwiz-seg-list">
              {segStatus === 'loading' ? (
                <div className="cwiz-seg-empty">Loading segments…</div>
              ) : filtered.length === 0 ? (
                <div className="cwiz-seg-empty">
                  {search ? `No segments match "${search}"` : 'No segments yet — create one below'}
                </div>
              ) : (
                filtered.map(s => (
                  <button
                    key={String(s.id)}
                    type="button"
                    className={'cwiz-seg-item' + (String(s.id) === selectedId ? ' selected' : '')}
                    onClick={() => {
                      onSelect(String(s.id), segLabel(s));
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <span className="cwiz-seg-item-name">{segLabel(s)}</span>
                    {s.count > 0 && (
                      <span className="cwiz-seg-item-count">
                        {s.count.toLocaleString('en-IN')} players
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Segment modal — reuses the shared implementation */}
      {showAddSeg && (
        <AddSegmentModal
          mode="create"
          onClose={() => setShowAddSeg(false)}
          onSaved={data => {
            if (data.id) {
              dispatch(fetchSegments());
              onSelect(data.id, data.name);
            }
            setShowAddSeg(false);
          }}
        />
      )}
    </>
  );
}

/* ================================================================== */
/* STEP 1 — Target Segment                                             */
/* ================================================================== */
interface Step1Props { s: Step1State; onChange: (s: Step1State) => void; channel: string; errors?: Set<string>; errorTick?: number; }

function Step1({ s, onChange, channel, errors, errorTick }: Step1Props) {
  const dispatch = useDispatch<any>();
  const set      = (patch: Partial<Step1State>) => onChange({ ...s, ...patch });
  const isPush   = channel === 'push';

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing]     = useState(false);

  const nameRef      = useRef<HTMLInputElement>(null);
  const platformsRef = useRef<HTMLDivElement>(null);
  const segmentRef   = useRef<HTMLDivElement>(null);

  /* Jump the user to (and highlight) the first missing required field. */
  useEffect(() => {
    if (!errors || errors.size === 0) return;
    const order: Array<[string, { current: HTMLElement | null }]> = [
      ['name', nameRef], ['platforms', platformsRef], ['segment', segmentRef],
    ];
    for (const [key, ref] of order) {
      if (errors.has(key) && ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ref.current.focus?.();
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorTick]);

  /* Bonus heads — read from shared Redux store (loaded by bonus app), fall back to direct fetch */


  const handlePreview = async () => {
    if (!s.segment_id) return;
    setPreviewing(true);
    try {
      const result = await dispatch(evaluateSegment(s.segment_id)).unwrap();
      setPreviewCount(result.size);
    } catch {
      /* keep previous count on error */
    } finally {
      setPreviewing(false);
    }
  };

  const TRIGGERS = [
    { id: 'on_session_start', label: 'On session start',  desc: 'Show on any screen when the session starts.' },
    { id: 'on_screen_load',   label: 'On screen load',    desc: 'Show on any screen or targeted specific screens.' },
    { id: 'on_custom_event',  label: 'On custom event',   desc: 'Shows when the user performs any custom event.' },
  ] as const;

  const PLATFORMS = [
    { id: 'android', label: 'Android' },
    { id: 'ios',     label: 'iOS'     },
    { id: 'web',     label: 'Web'     },
  ];

  return (
    <div className="cwiz-step-body">

      {/* Campaign details */}
      <div className="cwiz-card">
        <div className="cwiz-card-title">Campaign details</div>
        <div className="cwiz-form-grid">
          <div className="cwiz-field">
            <label className="cwiz-label">Campaign name <span className="cwiz-req">*</span></label>
            <input
              ref={nameRef}
              className={'cwiz-input' + (errors?.has('name') ? ' cwiz-input--error' : '')}
              placeholder="e.g. VIP Reactivation — June 2025"
              value={s.name}
              onChange={e => set({ name: e.target.value })}
            />
            {errors?.has('name') && <span className="cwiz-field-error">Campaign name is required.</span>}
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Campaign tags</label>
            <input
              className="cwiz-input"
              placeholder="Comma-separated tags"
              value={s.tags}
              onChange={e => set({ tags: e.target.value })}
            />
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Objective</label>
            <select className="cwiz-select" value={s.objective} onChange={e => set({ objective: e.target.value })}>
              {OBJECTIVES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Channel</label>
            <div className="cwiz-channel-display">
              <span>{channelLabel(channel)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Target platforms */}
      <div
        className="cwiz-card"
        ref={platformsRef}
        tabIndex={-1}
        style={errors?.has('platforms') ? { outline: '1px solid var(--crm-negative, #D64545)', borderRadius: 'var(--rl)' } : undefined}
      >
        <div className="cwiz-card-title">Target platforms <span className="cwiz-req">*</span></div>
        <div className="cwiz-checkboxes">
          {PLATFORMS.map(p => (
            <label key={p.id} className="cwiz-checkbox-label">
              <input
                type="checkbox"
                checked={s.platforms.includes(p.id)}
                onChange={e => set({
                  platforms: e.target.checked
                    ? [...s.platforms, p.id]
                    : s.platforms.filter(x => x !== p.id),
                })}
              />
              {p.label}
            </label>
          ))}
        </div>
        {errors?.has('platforms') && <span className="cwiz-field-error">Select at least one target platform.</span>}
      </div>

      {/* Trigger criteria — hidden for Push */}
      {!isPush && <div className="cwiz-card">
        <div className="cwiz-card-title">Trigger criteria <span className="cwiz-req">*</span></div>
        <div className="cwiz-trigger-grid">
          {TRIGGERS.map(t => {
            /* in_app only supports on_session_start this phase — the other
               two triggers are shown but disabled with a "Coming soon" tag.
               Other channels sharing this card are unaffected. */
            const comingSoon = channel === 'in_app' && t.id !== 'on_session_start';
            return (
              <button
                key={t.id}
                type="button"
                disabled={comingSoon}
                className={'cwiz-trigger-card' + (s.trigger_criteria === t.id ? ' selected' : '') + (comingSoon ? ' disabled' : '')}
                onClick={() => { if (!comingSoon) set({ trigger_criteria: t.id as TriggerCriteria }); }}
              >
                <Icon name={t.id === 'on_session_start' ? 'users' : t.id === 'on_screen_load' ? 'monitor' : 'zap'} size={20} strokeWidth={1.5} />
                <strong>{t.label}{comingSoon && <span className="cwiz-trigger-soon">Coming soon</span>}</strong>
                <span>{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>}

      {/* Notification expiry — in_app only */}
      {channel === 'in_app' && <div className="cwiz-card">
        <div className="cwiz-card-title">Notification expiry</div>
        <div className="cwiz-field" style={{ maxWidth: 260 }}>
          <label className="cwiz-label">Expires after (hours)</label>
          <input
            className="cwiz-input"
            type="number"
            min={1}
            placeholder="Leave blank for no expiry"
            value={s.expires_in_hours}
            onChange={e => set({ expires_in_hours: e.target.value })}
          />
          <span style={{ fontSize: 11, color: 'var(--crm-fg4)', marginTop: 4, display: 'block' }}>
            After this many hours, the notification stops appearing in the user's inbox even if unread. Leave blank to never expire.
          </span>
        </div>
      </div>}

      {/* Target segment */}
      <div
        className="cwiz-card"
        ref={segmentRef}
        tabIndex={-1}
        style={errors?.has('segment') ? { outline: '1px solid var(--crm-negative, #D64545)', borderRadius: 'var(--rl)' } : undefined}
      >
        <div className="cwiz-card-title">Target segment <span className="cwiz-req">*</span></div>
        <SegmentPicker
          selectedId={s.segment_id}
          selectedName={s.segment_name}
          onSelect={(id, name) => { set({ segment_id: id, segment_name: name }); setPreviewCount(null); }}
        />
        {errors?.has('segment') && <span className="cwiz-field-error">Target segment is required.</span>}

        {/* Estimated count — shown only after a segment is selected */}
        {s.segment_id && <div className="builder-preview" style={{ marginTop: 14 }}>
          <div className="builder-preview-num">
            {previewing
              ? '…'
              : previewCount !== null
                ? previewCount.toLocaleString('en-IN')
                : '—'}
          </div>
          <div className="builder-preview-meta">
            <span className="k">Estimated count</span>
            <span className="v">
              {previewing
                ? 'Computing…'
                : previewCount !== null
                  ? 'Segment members · live count'
                  : 'Click Preview to compute'}
            </span>
          </div>
          <button
            className="builder-refresh"
            type="button"
            title="Recompute"
            onClick={handlePreview}
            disabled={previewing || !s.segment_id}
          >
            <Icon name="refresh-cw" size={12} /> {previewing ? 'Loading…' : 'Preview'}
          </button>
        </div>}
      </div>

      {/* Control group — hidden for Push */}
      {!isPush && <div className="cwiz-card">
        <div className="cwiz-card-title">Control group</div>
        <div className="cwiz-toggles">
          <label className="cwiz-toggle-label">
            <Toggle checked={s.global_control}   onChange={v => set({ global_control: v })} />
            Global control group
          </label>
          <label className="cwiz-toggle-label">
            <Toggle checked={s.campaign_control} onChange={v => set({ campaign_control: v })} />
            Campaign control group
          </label>
        </div>
      </div>}

      {/* Bonus offer + Preview states */}
      <div className="cwiz-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Preview states */}
        {/* <div className="cwiz-checkboxes" style={{border: '1px solid #d1d5db', borderRadius: '10px',padding: '15px 15px',}}>
          <span className="cwiz-card-title" style={{ marginRight: 4, marginBottom: 0 }}>Preview states:</span>
          <label className="cwiz-checkbox-label">
            <input
              type="checkbox"
              checked={s.bonus_engine_integrated}
              onChange={e => set({ bonus_engine_integrated: e.target.checked })}
            />
            Bonus Engine integrated
          </label>
          <label className="cwiz-checkbox-label">
            <input
              type="checkbox"
              checked={s.bonus_section_enabled}
              onChange={e => set({ bonus_section_enabled: e.target.checked })}
            />
            Section enabled
          </label>
        </div> */}

        {/* Bonus container — dashed blue border */}
        <div className="cwiz-bonus-section"  style={{border: '1px dashed #0082c9', borderRadius: '10px',padding: '15px 15px', backgroundColor: '#F5FBFF'}}>
          <div className="cwiz-bonus-head">
            <div className="cwiz-bonus-head-box">
              <button type="button" className="asm-btn asm-btn--primary">
                <Icon name="gift" size={13} strokeWidth={2} />
                Bonus offer
              </button>
              <span style={{ marginLeft: '25px' }} className="cwiz-bonus-desc">Attach a bonus to this campaign</span>
              <span style={{ marginLeft: '25%' }}>
                <Toggle
                  checked={s.bonus_offer_enabled}
                  onChange={v => set({ bonus_offer_enabled: v })}
                />
              </span>
            </div>
          </div>
          <br/>

          <div className={'cwiz-bonus-body' + (!s.bonus_offer_enabled ? ' disabled' : '')}>
            <span className="cwiz-label">Select existing bonus</span>
            <div className="cwiz-seg-row">
              <select
                className="cwiz-seg-trigger"
                style={{ fontFamily: 'inherit', fontSize: 13, color: s.bonus_selected ? 'var(--crm-fg1,#1F2430)' : 'var(--crm-fg4,#9AA0A6)' }}
                value={s.bonus_selected}
                onChange={e => set({ bonus_selected: e.target.value })}
                disabled={!s.bonus_offer_enabled}
              >
                <option value="">— Choose a bonus —</option>
                <option value="welcome_bonus">Welcome Bonus</option>
                <option value="login_bonus">Login Bonus</option>
                <option value="new_year_bonus">New Year Bonus</option>
                <option value="christmas_bonus">Christmas Bonus</option>
                <option value="weekly_bonus">Weekly Bonus</option>
                <option value="cashback_bonus">Cashback Bonus</option>
                <option value="loyalty_bonus">Loyalty Bonus</option>
                <option value="referral_bonus">Referral Bonus</option>
              </select>
              <button type="button" className="cwiz-seg-add-btn" disabled={!s.bonus_offer_enabled}>
                <Icon name="plus" size={13} /> Create bonus
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ================================================================== */
/* STEP 2 — Content (simplified message builder)                       */
/* ================================================================== */
interface Step2Props { s: Step2State; onChange: (s: Step2State) => void; channel: string; errors?: Set<string>; errorTick?: number; }

const BLOCK_TYPES: { type: ContentBlock['type']; label: string; category: string; ai?: boolean }[] = [
  { type: 'heading',    label: 'Heading',     category: 'CONTENT'          },
  { type: 'text',       label: 'Text',        category: 'CONTENT'          },
  { type: 'image',      label: 'Image',       category: 'CONTENT'          },
  { type: 'hero_banner',label: 'Hero Banner', category: 'CONTENT'          },
  { type: 'promo_card', label: 'Promo Card',  category: 'OFFER'            },
  { type: 'bonus_offer',label: 'Bonus Offer', category: 'OFFER'            },
  { type: 'vip_offer',  label: 'VIP Offer',   category: 'OFFER',  ai: true },
  { type: 'countdown',  label: 'Countdown',   category: 'OFFER'            },
  { type: 'coupon',     label: 'Coupon',      category: 'OFFER'            },
  { type: 'cta_button', label: 'CTA Button',  category: 'ACTION'           },
  { type: 'poll',       label: 'Poll',        category: 'ACTION'           },
  { type: 'divider',    label: 'Divider',     category: 'UTILITY'          },
  { type: 'spacer',     label: 'Spacer',      category: 'UTILITY'          },
  { type: 'rg_footer',  label: 'RG Footer',   category: 'UTILITY'          },
];

const BLOCK_ICON: Record<string, string> = {
  heading: 'type', text: 'align-left', image: 'image', hero_banner: 'layout',
  promo_card: 'tag', bonus_offer: 'gift', vip_offer: 'star', countdown: 'clock', coupon: 'scissors',
  cta_button: 'mouse-pointer-click', poll: 'bar-chart-2',
  divider: 'minus', spacer: 'arrow-up-down', rg_footer: 'shield',
};

function BlockEditor({ block, onUpdate, onRemove }: {
  block: ContentBlock;
  onUpdate: (data: Record<string, string>) => void;
  onRemove: () => void;
}) {
  const typeLabel = BLOCK_TYPES.find(b => b.type === block.type)?.label ?? block.type;
  return (
    <div className="cwiz-block">
      <div className="cwiz-block-header">
        <span className="cwiz-block-type">{typeLabel.toUpperCase()}</span>
        <button type="button" className="cwiz-block-remove" onClick={onRemove} aria-label="Remove block">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="cwiz-block-body">
        {block.type === 'heading' && (
          <input
            className="cwiz-input"
            placeholder="Your exclusive VIP offer is waiting 🎁"
            value={block.data.text ?? ''}
            onChange={e => onUpdate({ ...block.data, text: e.target.value })}
          />
        )}
        {block.type === 'text' && (
          <textarea
            className="cwiz-textarea"
            placeholder="Message body…"
            value={block.data.text ?? ''}
            onChange={e => onUpdate({ ...block.data, text: e.target.value })}
          />
        )}
        {block.type === 'cta_button' && (
          <div className="cwiz-form-grid">
            <div className="cwiz-field">
              <label className="cwiz-label">Label</label>
              <input className="cwiz-input" placeholder="Claim Your Bonus Now"
                value={block.data.label ?? ''} onChange={e => onUpdate({ ...block.data, label: e.target.value })} />
            </div>
            <div className="cwiz-field">
              <label className="cwiz-label">URL</label>
              <input className="cwiz-input" placeholder="{{cta_url}}"
                value={block.data.url ?? ''} onChange={e => onUpdate({ ...block.data, url: e.target.value })} />
            </div>
          </div>
        )}
        {block.type === 'vip_offer' && (
          <div className="cwiz-form-grid">
            {['title', 'amount', 'expiry'].map(f => (
              <div className="cwiz-field" key={f}>
                <label className="cwiz-label" style={{ textTransform: 'capitalize' }}>{f}</label>
                <input className="cwiz-input" placeholder={`{{${f}}}`}
                  value={block.data[f] ?? ''} onChange={e => onUpdate({ ...block.data, [f]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
        {['image', 'hero_banner'].includes(block.type) && (
          <input className="cwiz-input" placeholder="Image URL or upload path"
            value={block.data.src ?? ''} onChange={e => onUpdate({ ...block.data, src: e.target.value })} />
        )}
        {['rg_footer', 'divider', 'spacer', 'promo_card', 'bonus_offer', 'countdown', 'coupon', 'poll'].includes(block.type) && (
          <p className="cwiz-block-placeholder">
            {block.type === 'rg_footer'
              ? 'Responsible gaming disclaimer — auto-populated from compliance settings.'
              : `${BLOCK_TYPES.find(b => b.type === block.type)?.label ?? block.type} block — configure content.`
            }
          </p>
        )}
      </div>
    </div>
  );
}

// const PLACEHOLDERS = ['{{first_name}}', '{{last_name}}', '{{username}}'] as const;

function Step2({ s, onChange, channel, errors, errorTick }: Step2Props) {
  const isPush = channel === 'push';
  const set    = (patch: Partial<Step2State>) => onChange({ ...s, ...patch });

  /* Refs kept for future placeholder re-enable, also used to jump to the
     first missing required field when the user clicks Next with errors. */
  const titleRef   = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!errors || errors.size === 0) return;
    const order: Array<[string, { current: HTMLElement | null }]> = [
      ['push_title', titleRef], ['push_content', contentRef],
    ];
    for (const [key, ref] of order) {
      if (errors.has(key) && ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ref.current.focus();
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorTick]);

  /* insertPlaceholder — disabled while placeholder chips are commented out
  const insertPlaceholder = (placeholder: string) => {
    const isTitle = document.activeElement === titleRef.current;
    const el      = isTitle ? titleRef.current : contentRef.current;
    const val     = isTitle ? s.push_title : s.push_content;
    const start   = el?.selectionStart ?? val.length;
    const end     = el?.selectionEnd   ?? start;
    const newVal  = val.slice(0, start) + placeholder + val.slice(end);
    const newPos  = start + placeholder.length;
    set(isTitle ? { push_title: newVal } : { push_content: newVal });
    requestAnimationFrame(() => {
      if (el) { el.focus(); el.setSelectionRange(newPos, newPos); }
    });
  };
  */

  /* ── Push notification form ── */
  if (isPush) {
    return (
      <div className="cwiz-step-body">
        <div className="cwiz-card">
          <div className="cwiz-card-title">Push Notification Content</div>

          {/* Placeholder chips — temporarily disabled
          <div className="cwiz-ph-row">
            <span className="cwiz-ph-label">Insert variable:</span>
            {PLACEHOLDERS.map(ph => (
              <button
                key={ph}
                type="button"
                className="cwiz-ph-chip"
                onMouseDown={e => { e.preventDefault(); insertPlaceholder(ph); }}
              >
                {ph}
              </button>
            ))}
          </div>
          */}

          <div className="cwiz-field" style={{ marginBottom: 14 }}>
            <label className="cwiz-label">
              Title <span className="cwiz-req">*</span>
            </label>
            <input
              ref={titleRef}
              className={'cwiz-input' + (errors?.has('push_title') ? ' cwiz-input--error' : '')}
              type="text"
              placeholder="e.g. Your exclusive offer is waiting 🎁"
              value={s.push_title}
              onChange={e => set({ push_title: e.target.value })}
            />
            {errors?.has('push_title') && <span className="cwiz-field-error">Push title is required.</span>}
          </div>

          <div className="cwiz-field" style={{ marginBottom: 14 }}>
            <label className="cwiz-label">
              Content <span className="cwiz-req">*</span>
            </label>
            <textarea
              ref={contentRef}
              className={'cwiz-textarea' + (errors?.has('push_content') ? ' cwiz-input--error' : '')}
              rows={4}
              placeholder="Enter the push notification message body…"
              value={s.push_content}
              onChange={e => set({ push_content: e.target.value })}
            />
            {errors?.has('push_content') && <span className="cwiz-field-error">Push content is required.</span>}
          </div>

          <div className="cwiz-field">
            <label className="cwiz-label">Deep Link</label>
            <input
              className="cwiz-input"
              type="text"
              placeholder="e.g. myapp://offers/vip  (optional)"
              value={s.push_deep_link}
              onChange={e => set({ push_deep_link: e.target.value })}
            />
            <span style={{ fontSize: 11, color: 'var(--crm-fg4)', marginTop: 4, display: 'block' }}>
              URL or app deep link opened when the user taps the notification.
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ── In-app template authoring (variants) ── */
  if (channel === 'in_app') {
    return <InAppEditor s={s} onChange={onChange} errors={errors} errorTick={errorTick} />;
  }

  /* ── Block builder (non-push, non-in_app channels) ── */
  const addBlock = (type: ContentBlock['type']) => onChange({ ...s, blocks: [...s.blocks, DEFAULT_BLOCK(type)] });
  const removeBlock = (id: string) => onChange({ ...s, blocks: s.blocks.filter(b => b.id !== id) });
  const updateBlock = (id: string, data: Record<string, string>) =>
    onChange({ ...s, blocks: s.blocks.map(b => b.id === id ? { ...b, data } : b) });

  const categories = [...new Set(BLOCK_TYPES.map(b => b.category))];

  return (
    <div className="cwiz-builder">
      {/* Left sidebar */}
      <div className="cwiz-sidebar">
        {categories.map(cat => (
          <div key={cat}>
            <div className="cwiz-sidebar-label">{cat}</div>
            {BLOCK_TYPES.filter(b => b.category === cat).map(b => (
              <button key={b.type} type="button" className="cwiz-sidebar-item" onClick={() => addBlock(b.type)}>
                <Icon name={BLOCK_ICON[b.type] ?? 'square'} size={14} />
                {b.label}
                {b.ai && <span className="cwiz-ai-badge">AI</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="cwiz-canvas">
        {s.blocks.length === 0 ? (
          <div className="cwiz-canvas-empty">
            <Icon name="layout" size={32} color="var(--g300)" />
            <p>Add blocks from the sidebar to build your message.</p>
          </div>
        ) : (
          s.blocks.map(b => (
            <BlockEditor
              key={b.id}
              block={b}
              onUpdate={data => updateBlock(b.id, data)}
              onRemove={() => removeBlock(b.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* In-App template authoring — variant tabs, template picker,          */
/* common fields, and per-type layout editors                         */
/* ================================================================== */
const IN_APP_NATIVE_TYPES: { type: InAppTemplateType; label: string }[] = [
  { type: 'modal',        label: 'Modal' },
  { type: 'popup_image',  label: 'Popup Image' },
  { type: 'rating',       label: 'Rating' },
  { type: 'fullscreen',   label: 'Fullscreen' },
  { type: 'nudge',        label: 'Nudge' },
  { type: 'carousel',     label: 'Carousel' },
  { type: 'survey',       label: 'Survey' },
  { type: 'lead_gen',     label: 'Lead Gen' },
  { type: 'gamification', label: 'Gamification' },
];
const IN_APP_HTML_TYPES: { type: InAppTemplateType; label: string }[] = [
  { type: 'html_nudge', label: 'HTML Nudge' },
];
const IN_APP_TYPE_LABEL: Record<InAppTemplateType, string> =
  Object.fromEntries([...IN_APP_NATIVE_TYPES, ...IN_APP_HTML_TYPES].map(t => [t.type, t.label])) as Record<InAppTemplateType, string>;

interface InAppEditorProps { s: Step2State; onChange: (s: Step2State) => void; errors?: Set<string>; errorTick?: number; }

function InAppEditor({ s, onChange, errors, errorTick }: InAppEditorProps) {
  // Multi-variant A/B authoring is deferred — always exactly one variant,
  // weight locked at 100. Re-introduce variant tabs when that ships.
  const variants = s.in_app_variants;
  const idx    = 0;
  const active = variants[0] ?? DEFAULT_VARIANT();

  const setVariants   = (next: Variant[]) => onChange({ ...s, in_app_variants: next });
  const updateVariant = (i: number, patch: Partial<Variant>) =>
    setVariants(variants.map((v, vi) => vi === i ? { ...v, ...patch } : v));

  const setTemplateType = (type: InAppTemplateType) => {
    updateVariant(idx, {
      template_type: type,
      render_engine: type === 'html_nudge' ? 'html' : 'native',
      layout:        IN_APP_FLAT_TYPES.has(type) ? null : defaultLayoutFor(type),
    });
  };

  const category = IN_APP_HTML_TYPES.some(t => t.type === active.template_type) ? 'html' : 'native';
  const setCategory = (next: 'native' | 'html') => {
    if (next === category) return;
    setTemplateType(next === 'html' ? IN_APP_HTML_TYPES[0].type : IN_APP_NATIVE_TYPES[0].type);
  };

  const cta          = active.cta ?? [];
  const primaryCta    = cta.find(c => c.role === 'primary');
  const secondaryCta  = cta.find(c => c.role === 'secondary');
  const isFlat        = IN_APP_FLAT_TYPES.has(active.template_type);

  const setPrimaryCta = (patch: Partial<Cta>) => {
    const pIdx = cta.findIndex(c => c.role === 'primary');
    const next = pIdx >= 0
      ? cta.map((c, i) => i === pIdx ? { ...c, ...patch } : c)
      : [...cta, { role: 'primary' as const, label: '', action: 'dismiss' as const, value: '', ...patch }];
    updateVariant(idx, { cta: next });
  };
  const setSecondaryCta = (patch: Partial<Cta>) => {
    const sIdx = cta.findIndex(c => c.role === 'secondary');
    const next = sIdx >= 0
      ? cta.map((c, i) => i === sIdx ? { ...c, ...patch } : c)
      : [...cta, { role: 'secondary' as const, label: '', action: 'dismiss' as const, value: '', ...patch }];
    updateVariant(idx, { cta: next });
  };
  const removeSecondaryCta = () => updateVariant(idx, { cta: cta.filter(c => c.role !== 'secondary') });

  return (
    <div className="cwiz-step-body">

      {/* Template type picker — 2 dropdowns for now (category, then specific type) */}
      <div className="cwiz-card">
        <div className="cwiz-card-title">Template type</div>
        <div className="cwiz-form-grid">
          <div className="cwiz-field">
            <label className="cwiz-label">Category</label>
            <select
              className="cwiz-select"
              value={category}
              onChange={e => setCategory(e.target.value as 'native' | 'html')}
            >
              <option value="native">Native Templates</option>
              <option value="html">HTML Templates</option>
            </select>
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Template</label>
            <select
              className="cwiz-select"
              value={active.template_type}
              onChange={e => setTemplateType(e.target.value as InAppTemplateType)}
            >
              {(category === 'html' ? IN_APP_HTML_TYPES : IN_APP_NATIVE_TYPES).map(t => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Common fields */}
      <div className="cwiz-card">
        <div className="cwiz-card-title">Content</div>
        {isFlat && errors?.has(`in_app_variant_${idx}`) && (
          <span className="cwiz-field-error" style={{ display: 'block', marginBottom: 10 }}>
            Title and body are both required.
          </span>
        )}

        <div className="cwiz-field" style={{ marginBottom: 14 }}>
          <label className="cwiz-label">Title</label>
          <input
            className={'cwiz-input' + (isFlat && errors?.has(`in_app_variant_${idx}`) && !active.title?.trim() ? ' cwiz-input--error' : '')}
            value={active.title ?? ''}
            placeholder="e.g. Don't miss out!"
            onChange={e => updateVariant(idx, { title: e.target.value })}
          />
          <span className={'cwiz-char-counter' + ((active.title?.length ?? 0) > 60 ? ' over' : '')}>
            {active.title?.length ?? 0}/60
          </span>
        </div>

        <div className="cwiz-field" style={{ marginBottom: 14 }}>
          <label className="cwiz-label">Body</label>
          <textarea
            className={'cwiz-textarea' + (isFlat && errors?.has(`in_app_variant_${idx}`) && !active.body?.trim() ? ' cwiz-input--error' : '')}
            value={active.body ?? ''}
            placeholder="Message body…"
            onChange={e => updateVariant(idx, { body: e.target.value })}
          />
          <span className={'cwiz-char-counter' + ((active.body?.length ?? 0) > 200 ? ' over' : '')}>
            {active.body?.length ?? 0}/200
          </span>
        </div>

        <div className="cwiz-form-grid" style={{ marginBottom: 14 }}>
          <div className="cwiz-field">
            <label className="cwiz-label">Image URL</label>
            <input
              className="cwiz-input"
              value={active.media?.image_url ?? ''}
              placeholder="https://…"
              onChange={e => updateVariant(idx, { media: { ...active.media, image_url: e.target.value } })}
            />
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Background color</label>
            <input
              type="color"
              className="cwiz-input"
              style={{ padding: 2, width: 60 }}
              value={active.media?.background_color || '#ffffff'}
              onChange={e => updateVariant(idx, { media: { ...active.media, background_color: e.target.value } })}
            />
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Background opacity</label>
            <select
              className="cwiz-select"
              value={active.media?.background_opacity ?? ''}
              onChange={e => updateVariant(idx, {
                media: { ...active.media, background_opacity: (e.target.value || undefined) as Media['background_opacity'] },
              })}
            >
              <option value="">—</option>
              <option value="opaque">Opaque</option>
              <option value="translucent">Translucent</option>
              <option value="transparent">Transparent</option>
            </select>
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Close button</label>
            <select className="cwiz-select" value="always" disabled>
              <option value="always">Always</option>
            </select>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="cwiz-cta-block">
          <div className="cwiz-cta-block-head">
            <strong style={{ fontSize: 12.5 }}>Primary CTA <span className="cwiz-req">*</span></strong>
          </div>
          <div className="cwiz-form-grid">
            <div className="cwiz-field">
              <label className="cwiz-label">Label</label>
              <input className="cwiz-input" value={primaryCta?.label ?? ''} onChange={e => setPrimaryCta({ label: e.target.value })} />
            </div>
            <div className="cwiz-field">
              <label className="cwiz-label">Action</label>
              <select
                className="cwiz-select"
                value={primaryCta?.action ?? 'dismiss'}
                onChange={e => setPrimaryCta({ action: e.target.value as Cta['action'] })}
              >
                <option value="deep_link">Deep link</option>
                <option value="external_url">External URL</option>
                <option value="dismiss">Dismiss</option>
              </select>
            </div>
            {primaryCta && primaryCta.action !== 'dismiss' && (
              <div className="cwiz-field">
                <label className="cwiz-label">Value</label>
                <input
                  className={'cwiz-input' + (errors?.has(`in_app_variant_${idx}_cta`) && !primaryCta.value?.trim() ? ' cwiz-input--error' : '')}
                  placeholder="e.g. myapp://offer or https://…"
                  value={primaryCta?.value ?? ''}
                  onChange={e => setPrimaryCta({ value: e.target.value })}
                />
              </div>
            )}
          </div>
          {errors?.has(`in_app_variant_${idx}_cta`) && (
            <span className="cwiz-field-error" style={{ display: 'block', marginTop: 6 }}>
              {!(cta.some(c => c.role === 'primary'))
                ? 'A primary CTA is required.'
                : 'This CTA needs a value (deep link / URL) since its action isn\'t "Dismiss".'}
            </span>
          )}
        </div>

        {/* Secondary CTA */}
        {secondaryCta ? (
          <div className="cwiz-cta-block">
            <div className="cwiz-cta-block-head">
              <strong style={{ fontSize: 12.5 }}>Secondary CTA</strong>
              <button type="button" className="cwiz-block-remove" onClick={removeSecondaryCta} aria-label="Remove secondary CTA">
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="cwiz-form-grid">
              <div className="cwiz-field">
                <label className="cwiz-label">Label</label>
                <input className="cwiz-input" value={secondaryCta.label ?? ''} onChange={e => setSecondaryCta({ label: e.target.value })} />
              </div>
              <div className="cwiz-field">
                <label className="cwiz-label">Action</label>
                <select
                  className="cwiz-select"
                  value={secondaryCta.action}
                  onChange={e => setSecondaryCta({ action: e.target.value as Cta['action'] })}
                >
                  <option value="deep_link">Deep link</option>
                  <option value="external_url">External URL</option>
                  <option value="dismiss">Dismiss</option>
                </select>
              </div>
              {secondaryCta.action !== 'dismiss' && (
                <div className="cwiz-field">
                  <label className="cwiz-label">Value</label>
                  <input
                    className={'cwiz-input' + (errors?.has(`in_app_variant_${idx}_cta`) && !secondaryCta.value?.trim() ? ' cwiz-input--error' : '')}
                    placeholder="e.g. myapp://offer or https://…"
                    value={secondaryCta.value ?? ''}
                    onChange={e => setSecondaryCta({ value: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="asm-btn asm-btn--secondary"
            style={{ fontSize: 12, height: 30, padding: '0 12px', marginBottom: 14 }}
            onClick={() => setSecondaryCta({})}
          >
            <Icon name="plus" size={12} /> Add Secondary CTA
          </button>
        )}

        {/* Web view override — available regardless of template_type */}
        <div className="cwiz-field">
          <label className="cwiz-label">Load full website instead (optional)</label>
          <input
            className="cwiz-input"
            value={active.web_view_url ?? ''}
            placeholder="https://…"
            onChange={e => updateVariant(idx, { web_view_url: e.target.value })}
          />
        </div>
      </div>

      {/* Per-type layout editor — only for the 6 non-flat types */}
      {!isFlat && (
        <div className="cwiz-card">
          <div className="cwiz-card-title">Layout — {IN_APP_TYPE_LABEL[active.template_type]}</div>
          {errors?.has(`in_app_variant_${idx}`) && (
            <span className="cwiz-field-error" style={{ display: 'block', marginBottom: 10 }}>
              This template type needs at least one item filled in below.
            </span>
          )}
          {active.template_type === 'carousel'     && <CarouselLayoutEditor     variant={active} onUpdate={patch => updateVariant(idx, patch)} />}
          {active.template_type === 'survey'       && <SurveyLayoutEditor       variant={active} onUpdate={patch => updateVariant(idx, patch)} />}
          {active.template_type === 'lead_gen'     && <LeadGenLayoutEditor      variant={active} onUpdate={patch => updateVariant(idx, patch)} />}
          {active.template_type === 'gamification' && <GamificationLayoutEditor variant={active} onUpdate={patch => updateVariant(idx, patch)} />}
          {active.template_type === 'rating'       && <RatingLayoutEditor      variant={active} onUpdate={patch => updateVariant(idx, patch)} />}
          {active.template_type === 'html_nudge'   && <HtmlNudgeLayoutEditor   variant={active} onUpdate={patch => updateVariant(idx, patch)} />}
        </div>
      )}
    </div>
  );
}

interface LayoutEditorProps { variant: Variant; onUpdate: (patch: Partial<Variant>) => void; }

function CarouselLayoutEditor({ variant, onUpdate }: LayoutEditorProps) {
  const layout = (variant.layout as CarouselLayout | null) ?? { slides: [] };
  const slides = layout.slides ?? [];
  const setSlides = (next: CarouselSlide[]) => onUpdate({ layout: { slides: next } });
  return (
    <div className="cwiz-list-group">
      {slides.map((slide, i) => (
        <div className="cwiz-list-item" key={i}>
          {slides.length > 1 && (
            <button type="button" className="cwiz-list-item-remove" onClick={() => setSlides(slides.filter((_, si) => si !== i))} aria-label="Remove slide">
              <Icon name="x" size={13} />
            </button>
          )}
          <div className="cwiz-form-grid">
            <div className="cwiz-field">
              <label className="cwiz-label">Image URL</label>
              <input className="cwiz-input" value={slide.image_url ?? ''}
                onChange={e => setSlides(slides.map((sl, si) => si === i ? { ...sl, image_url: e.target.value } : sl))} />
            </div>
            <div className="cwiz-field">
              <label className="cwiz-label">Title</label>
              <input className="cwiz-input" value={slide.title ?? ''}
                onChange={e => setSlides(slides.map((sl, si) => si === i ? { ...sl, title: e.target.value } : sl))} />
            </div>
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Body</label>
            <textarea className="cwiz-textarea" value={slide.body ?? ''}
              onChange={e => setSlides(slides.map((sl, si) => si === i ? { ...sl, body: e.target.value } : sl))} />
          </div>
        </div>
      ))}
      <button type="button" className="asm-btn asm-btn--secondary" style={{ fontSize: 12, height: 30, padding: '0 12px', alignSelf: 'flex-start' }}
        onClick={() => setSlides([...slides, { image_url: '', title: '', body: '' }])}>
        <Icon name="plus" size={12} /> Add Slide
      </button>
    </div>
  );
}

function SurveyLayoutEditor({ variant, onUpdate }: LayoutEditorProps) {
  const layout = (variant.layout as SurveyLayout | null) ?? { questions: [] };
  const questions = layout.questions ?? [];
  const setQuestions = (next: SurveyQuestion[]) => onUpdate({ layout: { questions: next } });
  return (
    <div className="cwiz-list-group">
      {questions.map((q, qi) => (
        <div className="cwiz-list-item" key={qi}>
          {questions.length > 1 && (
            <button type="button" className="cwiz-list-item-remove" onClick={() => setQuestions(questions.filter((_, i) => i !== qi))} aria-label="Remove question">
              <Icon name="x" size={13} />
            </button>
          )}
          <div className="cwiz-field">
            <label className="cwiz-label">Question</label>
            <input className="cwiz-input" value={q.question_text ?? ''}
              onChange={e => setQuestions(questions.map((qq, i) => i === qi ? { ...qq, question_text: e.target.value } : qq))} />
          </div>
          <div className="cwiz-field">
            <label className="cwiz-label">Options</label>
            {(q.options ?? []).map((opt, oi) => (
              <div className="cwiz-option-row" key={oi}>
                <input className="cwiz-input" value={opt}
                  onChange={e => setQuestions(questions.map((qq, i) => i === qi
                    ? { ...qq, options: qq.options.map((o, oo) => oo === oi ? e.target.value : o) } : qq))} />
                {q.options.length > 1 && (
                  <button type="button" className="cwiz-block-remove" aria-label="Remove option"
                    onClick={() => setQuestions(questions.map((qq, i) => i === qi
                      ? { ...qq, options: qq.options.filter((_, oo) => oo !== oi) } : qq))}>
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="asm-btn asm-btn--secondary" style={{ fontSize: 11, height: 26, padding: '0 10px', marginTop: 4 }}
              onClick={() => setQuestions(questions.map((qq, i) => i === qi ? { ...qq, options: [...qq.options, ''] } : qq))}>
              <Icon name="plus" size={11} /> Add Option
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="asm-btn asm-btn--secondary" style={{ fontSize: 12, height: 30, padding: '0 12px', alignSelf: 'flex-start' }}
        onClick={() => setQuestions([...questions, { question_text: '', options: [''] }])}>
        <Icon name="plus" size={12} /> Add Question
      </button>
    </div>
  );
}

function LeadGenLayoutEditor({ variant, onUpdate }: LayoutEditorProps) {
  const layout = (variant.layout as LeadGenLayout | null) ?? { fields: [], submit_action: { action: 'dismiss', value: '' } };
  const fields = layout.fields ?? [];
  const submitAction = layout.submit_action ?? { action: 'dismiss', value: '' };
  const setFields       = (next: LeadGenField[])        => onUpdate({ layout: { ...layout, fields: next, submit_action: submitAction } });
  const setSubmitAction = (patch: Partial<LeadGenSubmit>) => onUpdate({ layout: { ...layout, fields, submit_action: { ...submitAction, ...patch } } });
  return (
    <div className="cwiz-list-group">
      {fields.map((f, fi) => (
        <div className="cwiz-list-item" key={fi}>
          {fields.length > 1 && (
            <button type="button" className="cwiz-list-item-remove" onClick={() => setFields(fields.filter((_, i) => i !== fi))} aria-label="Remove field">
              <Icon name="x" size={13} />
            </button>
          )}
          <div className="cwiz-form-grid">
            <div className="cwiz-field">
              <label className="cwiz-label">Field name</label>
              <input className="cwiz-input" value={f.name ?? ''}
                onChange={e => setFields(fields.map((ff, i) => i === fi ? { ...ff, name: e.target.value } : ff))} />
            </div>
            <div className="cwiz-field">
              <label className="cwiz-label">Type</label>
              <select className="cwiz-select" value={f.type}
                onChange={e => setFields(fields.map((ff, i) => i === fi ? { ...ff, type: e.target.value as LeadGenField['type'] } : ff))}>
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="number">Number</option>
              </select>
            </div>
          </div>
          <label className="cwiz-checkbox-label">
            <input type="checkbox" checked={f.required}
              onChange={e => setFields(fields.map((ff, i) => i === fi ? { ...ff, required: e.target.checked } : ff))} />
            Required
          </label>
        </div>
      ))}
      <button type="button" className="asm-btn asm-btn--secondary" style={{ fontSize: 12, height: 30, padding: '0 12px', alignSelf: 'flex-start' }}
        onClick={() => setFields([...fields, { name: '', type: 'text', required: false }])}>
        <Icon name="plus" size={12} /> Add Field
      </button>

      <div className="cwiz-card-title" style={{ marginTop: 6, marginBottom: 8 }}>Submit action</div>
      <div className="cwiz-form-grid">
        <div className="cwiz-field">
          <label className="cwiz-label">Action</label>
          <select className="cwiz-select" value={submitAction.action} onChange={e => setSubmitAction({ action: e.target.value })}>
            <option value="deep_link">Deep link</option>
            <option value="external_url">External URL</option>
            <option value="dismiss">Dismiss</option>
          </select>
        </div>
        {submitAction.action !== 'dismiss' && (
          <div className="cwiz-field">
            <label className="cwiz-label">Value</label>
            <input className="cwiz-input" value={submitAction.value ?? ''} onChange={e => setSubmitAction({ value: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  );
}

function GamificationLayoutEditor({ variant, onUpdate }: LayoutEditorProps) {
  const layout = (variant.layout as GamificationLayout | null) ?? { game_type: '', segments: [] };
  const segments = layout.segments ?? [];
  const setSegments = (next: GamificationSeg[]) => onUpdate({ layout: { ...layout, segments: next } });
  return (
    <div className="cwiz-list-group">
      <div className="cwiz-field">
        <label className="cwiz-label">Game type</label>
        <input className="cwiz-input" value={layout.game_type ?? ''} placeholder="e.g. spin_wheel"
          onChange={e => onUpdate({ layout: { ...layout, game_type: e.target.value } })} />
      </div>
      {segments.map((seg, si) => (
        <div className="cwiz-list-item" key={si}>
          {segments.length > 1 && (
            <button type="button" className="cwiz-list-item-remove" onClick={() => setSegments(segments.filter((_, i) => i !== si))} aria-label="Remove segment">
              <Icon name="x" size={13} />
            </button>
          )}
          <div className="cwiz-form-grid">
            <div className="cwiz-field">
              <label className="cwiz-label">Label</label>
              <input className="cwiz-input" value={seg.label ?? ''}
                onChange={e => setSegments(segments.map((sg, i) => i === si ? { ...sg, label: e.target.value } : sg))} />
            </div>
            <div className="cwiz-field">
              <label className="cwiz-label">Value</label>
              <input className="cwiz-input" value={seg.value ?? ''}
                onChange={e => setSegments(segments.map((sg, i) => i === si ? { ...sg, value: e.target.value } : sg))} />
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="asm-btn asm-btn--secondary" style={{ fontSize: 12, height: 30, padding: '0 12px', alignSelf: 'flex-start' }}
        onClick={() => setSegments([...segments, { label: '', value: '' }])}>
        <Icon name="plus" size={12} /> Add Segment
      </button>
    </div>
  );
}

function RatingLayoutEditor({ variant, onUpdate }: LayoutEditorProps) {
  const layout = (variant.layout as RatingLayout | null) ?? { max_stars: 5, prompt: '' };
  return (
    <div className="cwiz-form-grid">
      <div className="cwiz-field">
        <label className="cwiz-label">Max stars</label>
        <input className="cwiz-input" type="number" min={1} max={10} value={layout.max_stars ?? 5}
          onChange={e => onUpdate({ layout: { ...layout, max_stars: Number(e.target.value) || 5 } })} />
      </div>
      <div className="cwiz-field">
        <label className="cwiz-label">Prompt</label>
        <input className="cwiz-input" value={layout.prompt ?? ''} placeholder="How was your experience?"
          onChange={e => onUpdate({ layout: { ...layout, prompt: e.target.value } })} />
      </div>
    </div>
  );
}

function HtmlNudgeLayoutEditor({ variant, onUpdate }: LayoutEditorProps) {
  const layout = (variant.layout as HtmlNudgeLayout | null) ?? {};
  const mode: 'html' | 'hosted_url' = layout.hosted_url ? 'hosted_url' : 'html';
  return (
    <div className="cwiz-list-group">
      <div className="cwiz-sched-sub-row">
        <label className="cwiz-radio-label">
          <input type="radio" name={`html-mode-${variant.variant_id}`} checked={mode === 'html'}
            onChange={() => onUpdate({ layout: { html: layout.html ?? '' } })} />
          Inline HTML
        </label>
        <label className="cwiz-radio-label">
          <input type="radio" name={`html-mode-${variant.variant_id}`} checked={mode === 'hosted_url'}
            onChange={() => onUpdate({ layout: { hosted_url: layout.hosted_url ?? '' } })} />
          Hosted URL
        </label>
      </div>
      {mode === 'html' ? (
        <div className="cwiz-field">
          <label className="cwiz-label">HTML</label>
          <textarea className="cwiz-textarea" style={{ height: 140, fontFamily: 'monospace', fontSize: 12 }}
            value={layout.html ?? ''} onChange={e => onUpdate({ layout: { html: e.target.value } })} />
        </div>
      ) : (
        <div className="cwiz-field">
          <label className="cwiz-label">Hosted URL</label>
          <input className="cwiz-input" value={layout.hosted_url ?? ''} placeholder="https://…"
            onChange={e => onUpdate({ layout: { hosted_url: e.target.value } })} />
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* STEP 3 — Schedule & Goals                                           */
/* ================================================================== */
/* ── Helpers ── */
const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

function parseDates(raw: string): { valid: number[]; error: string } {
  if (!raw.trim()) return { valid: [], error: '' };
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const nums  = parts.map(Number);
  const bad   = nums.filter(n => isNaN(n) || n < 1 || n > 31 || !Number.isInteger(n));
  if (bad.length) return { valid: [], error: `Invalid date(s): ${bad.join(', ')}. Use integers 1–31.` };
  const unique = [...new Set(nums)].sort((a, b) => a - b);
  return { valid: unique, error: '' };
}

interface Step3Props { s: Step3State; onChange: (s: Step3State) => void; channel: string; errors?: Set<string>; errorTick?: number; }

function Step3({ s, onChange, channel, errors, errorTick }: Step3Props) {
  const set    = (patch: Partial<Step3State>) => onChange({ ...s, ...patch });
  const isPush = channel === 'push';

  const datetimeRef    = useRef<HTMLInputElement>(null);
  const timezoneRef    = useRef<HTMLSelectElement>(null);
  const startDateRef   = useRef<HTMLInputElement>(null);
  const triggerTimeRef = useRef<HTMLInputElement>(null);
  const daysRef        = useRef<HTMLDivElement>(null);
  const datesRef       = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!errors || errors.size === 0) return;
    const order: Array<[string, { current: HTMLElement | null }]> = [
      ['datetime', datetimeRef], ['start_date', startDateRef],
      ['trigger_time', triggerTimeRef], ['timezone', timezoneRef],
      ['days', daysRef], ['dates', datesRef],
    ];
    for (const [key, ref] of order) {
      if (errors.has(key) && ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ref.current.focus();
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorTick]);

  return (
    <div className="cwiz-step-body">

      {/* ── Send campaign ── */}
      <div className="cwiz-card">
        <div className="cwiz-card-title">Send campaign <span className="cwiz-req">*</span></div>

        {/* Top-level: One Time vs Periodic */}
        <div className="cwiz-sched-type-row">
          <label className="cwiz-radio-label">
            <input type="radio" name="schedule_type" value="one_time"
              checked={s.schedule_type === 'one_time'}
              onChange={() => set({ schedule_type: 'one_time', one_time_type: 'asap' })} />
            One Time
          </label>
          <label className="cwiz-radio-label">
            <input type="radio" name="schedule_type" value="periodic"
              checked={s.schedule_type === 'periodic'}
              onChange={() => set({ schedule_type: 'periodic', frequency: 'daily' })} />
            Periodic
          </label>
        </div>

        {/* ── ONE TIME config ── */}
        {s.schedule_type === 'one_time' && (
          <div className="cwiz-sched-panel">
            <div className="cwiz-sched-sub-row">
              <label className="cwiz-radio-label">
                <input type="radio" name="one_time_type" value="asap"
                  checked={s.one_time_type === 'asap'}
                  onChange={() => set({ one_time_type: 'asap', datetime: '' })} />
                Immediately
              </label>
              <label className="cwiz-radio-label">
                <input type="radio" name="one_time_type" value="specific_datetime"
                  checked={s.one_time_type === 'specific_datetime'}
                  onChange={() => set({ one_time_type: 'specific_datetime' })} />
                At specific date &amp; time
              </label>
            </div>
            {s.one_time_type === 'specific_datetime' && (
              <div className="cwiz-form-grid" style={{ marginTop: 14 }}>
                <div className="cwiz-field">
                  <label className="cwiz-label">Date &amp; Time <span className="cwiz-req">*</span></label>
                  <input ref={datetimeRef} className={'cwiz-input' + (errors?.has('datetime') ? ' cwiz-input--error' : '')} type="datetime-local"
                    value={s.datetime} onChange={e => set({ datetime: e.target.value })} />
                  {errors?.has('datetime') && <span className="cwiz-field-error">Send date &amp; time is required.</span>}
                </div>
                <div className="cwiz-field">
                  <label className="cwiz-label">Timezone <span className="cwiz-req">*</span></label>
                  <select ref={timezoneRef} className={'cwiz-select' + (errors?.has('timezone') ? ' cwiz-input--error' : '')} value={s.timezone} onChange={e => set({ timezone: e.target.value })}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                  {errors?.has('timezone') && <span className="cwiz-field-error">Timezone is required.</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PERIODIC config ── */}
        {s.schedule_type === 'periodic' && (
          <div className="cwiz-sched-panel">
            {/* Frequency selector */}
            <div className="cwiz-sched-sub-row">
              {(['daily', 'weekly', 'monthly'] as const).map(f => (
                <label key={f} className="cwiz-radio-label">
                  <input type="radio" name="frequency" value={f}
                    checked={s.frequency === f}
                    onChange={() => set({ frequency: f, days: [], dates_input: '', dates_error: '' })} />
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </label>
              ))}
            </div>

            {/* Common fields: Start / End / Trigger Time / Timezone */}
            <div className="cwiz-form-grid" style={{ marginTop: 14 }}>
              <div className="cwiz-field">
                <label className="cwiz-label">Start Date <span className="cwiz-req">*</span></label>
                <input ref={startDateRef} className={'cwiz-input' + (errors?.has('start_date') ? ' cwiz-input--error' : '')} type="date"
                  value={s.start_date} onChange={e => set({ start_date: e.target.value })} />
                {errors?.has('start_date') && <span className="cwiz-field-error">Start date is required.</span>}
              </div>
              <div className="cwiz-field">
                <label className="cwiz-label">End Date</label>
                <input className="cwiz-input" type="date"
                  value={s.end_date} onChange={e => set({ end_date: e.target.value })} />
              </div>
              <div className="cwiz-field">
                <label className="cwiz-label">Trigger Time (24h) <span className="cwiz-req">*</span></label>
                <input ref={triggerTimeRef} className={'cwiz-input' + (errors?.has('trigger_time') ? ' cwiz-input--error' : '')} type="time"
                  value={s.trigger_time} onChange={e => set({ trigger_time: e.target.value })} />
                {errors?.has('trigger_time') && <span className="cwiz-field-error">Trigger time is required.</span>}
              </div>
              <div className="cwiz-field">
                <label className="cwiz-label">Timezone <span className="cwiz-req">*</span></label>
                <select ref={timezoneRef} className={'cwiz-select' + (errors?.has('timezone') ? ' cwiz-input--error' : '')} value={s.timezone} onChange={e => set({ timezone: e.target.value })}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
                {errors?.has('timezone') && <span className="cwiz-field-error">Timezone is required.</span>}
              </div>
            </div>

            {/* Weekly — days of week */}
            {s.frequency === 'weekly' && (
              <div className="cwiz-field" style={{ marginTop: 14 }} ref={daysRef}>
                <label className="cwiz-label">Days of Week <span className="cwiz-req">*</span></label>
                <div className="cwiz-day-row">
                  {WEEK_DAYS.map(d => {
                    const checked = s.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={'cwiz-day-chip' + (checked ? ' selected' : '')}
                        onClick={() => set({
                          days: checked ? s.days.filter(x => x !== d) : [...s.days, d],
                        })}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                {s.days.length === 0 && (
                  <span className="cwiz-field-error">Select at least one day.</span>
                )}
              </div>
            )}

            {/* Monthly — dates */}
            {s.frequency === 'monthly' && (
              <div className="cwiz-field" style={{ marginTop: 14 }}>
                <label className="cwiz-label">Dates of Month <span className="cwiz-req">*</span></label>
                <input
                  ref={datesRef}
                  className={'cwiz-input' + (s.dates_error ? ' cwiz-input--error' : '')}
                  type="text"
                  placeholder="e.g. 5,10,15,25"
                  value={s.dates_input}
                  onChange={e => {
                    const raw = e.target.value;
                    const { error } = parseDates(raw);
                    set({ dates_input: raw, dates_error: error });
                  }}
                />
                {s.dates_error
                  ? <span className="cwiz-field-error">{s.dates_error}</span>
                  : <span className="cwiz-field-hint">Comma-separated day numbers (1–31). Duplicates removed automatically.</span>
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversion goals — hidden for Push */}
      {!isPush && <div className="cwiz-card">
        <div className="cwiz-card-title">Conversion goals</div>
        <button type="button" className="asm-btn asm-btn--secondary" style={{ fontSize: 12, height: 30, padding: '0 12px' }}>
          <Icon name="plus" size={12} /> New goal
        </button>
      </div>}

      {/* Delivery controls */}
      <div className="cwiz-card">
        <div className="cwiz-card-title">Delivery controls</div>
        <div className="cwiz-delivery-list">
          {/* Row 1 — always visible */}
          <div className="cwiz-delivery-row">
            <Toggle checked={s.enable_rate_limit} onChange={v => set({ enable_rate_limit: v, ...(!v && { max_frequency: '0' }) })} />
            <span className="cwiz-delivery-text">Limit the maximum number of times a user can see messages from this campaign to</span>
            <input className="cwiz-delivery-num" type="number" min="1" value={s.max_frequency} disabled={!s.enable_rate_limit} onChange={e => set({ max_frequency: e.target.value })} />
            <span style={{ fontSize: 12, color: 'var(--g500)', paddingLeft: 15 }}>times</span>
          </div>
          {/* Row 2 — hidden for Push */}
          {!isPush && <div className="cwiz-delivery-row">
            <Toggle checked={s.enable_min_delay} onChange={v => set({ enable_min_delay: v, ...(!v && { min_delay: '0' }) })} />
            <span className="cwiz-delivery-text">Add a minimum delay between two messages of this campaign</span>
            <input className="cwiz-delivery-num" type="number" min="1" value={s.min_delay} disabled={!s.enable_min_delay} onChange={e => set({ min_delay: e.target.value })} />
            <select className="cwiz-delivery-unit" value={s.min_delay_unit} disabled={!s.enable_min_delay} onChange={e => set({ min_delay_unit: e.target.value })}>
              <option>Mins</option><option>Hours</option><option>Days</option>
            </select>
          </div>}
          {/* Row 3 — hidden for Push */}
          {!isPush && <div className="cwiz-delivery-row">
            <Toggle checked={s.ignore_global_delay} onChange={v => set({ ignore_global_delay: v })} />
            <span className="cwiz-delivery-text">Ignore global minimum delay</span>
          </div>}
          {/* Row 4 — always visible */}
          <div className="cwiz-delivery-row">
            <Toggle checked={s.enable_auto_dismiss} onChange={v => set({ enable_auto_dismiss: v, ...(!v && { auto_dismiss_after: '0' }) })} />
            <span className="cwiz-delivery-text">Number of seconds before auto dismiss message</span>
            <input className="cwiz-delivery-num" type="number" min="1" value={s.auto_dismiss_after} disabled={!s.enable_auto_dismiss} onChange={e => set({ auto_dismiss_after: e.target.value })} />
            <span style={{ fontSize: 12, color: 'var(--g500)' }}>seconds</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle primitive                                                     */
/* ------------------------------------------------------------------ */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={'cwiz-toggle' + (checked ? ' on' : '')}
      onClick={() => onChange(!checked)}
    />
  );
}
