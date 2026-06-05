import type {
  Segment, SegmentRule,
  TraitOperatorsResponse, DerivedRuleConfig, ParameterOperatorsResponse,
} from "../types";
import { getToken } from './tokenRegistry';

const BASE = process.env.NEXT_PUBLIC_SEG_API_URL || "http://localhost:8003";
const SEG_API = `${BASE}/api/v1/segment`;

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SegmentMember {
  user_id: string;
  joined_at: string;
}

export interface MemberPage {
  segment_id: string;
  members: SegmentMember[];
  has_more: boolean;
  next_cursor: string | null;
  total_members: number | null;
}

export interface MembershipCheck {
  segment_id: string;
  user_id: string;
  is_member: boolean;
  joined_at: string | null;
}

export interface EvaluateResult {
  segment_id: string;
  size: number;
  computed_at: string;
}

export interface MetaOperators {
  frequency: string[];
  property: string[];
  trait: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSegment(s: {
  segment_id: string;
  name: string;
  members_count: number | null;
  last_refresh_time: string | null;
  created_by: string | null;
  rule?: unknown;
  refresh_strategy?: string;
  scheduled_cron?: string | null;
}): Segment {
  return {
    id:               s.segment_id,
    label:            s.name,
    count:            s.members_count ?? 0,
    last_used_at:     s.last_refresh_time ?? undefined,
    owner:            s.created_by ?? undefined,
    rule:             s.rule,
    refresh_strategy: s.refresh_strategy,
    scheduled_cron:   s.scheduled_cron ?? undefined,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const OP_MAP: Record<string, string> = {
  IS: "eq",
  IS_NOT: "neq",
  IN: "in",
  NOT_IN: "not_in",
  GT: "gt",
  LT: "lt",
  GTE: "gte",
  EQ: "eq",
};

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

type ExtendedRule = SegmentRule & {
  value2?: string;
  eventProp?: string;
  eventPropOp?: string;
  eventPropValue?: string;
  derivedParams?: Record<string, { op: string; value: string }>;
};

function toSnakeCase(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Smart type coercion: converts string representations to their natural types.
 *   "true"/"false" → boolean
 *   "18" / "1.5"   → number
 *   everything else → unchanged
 */
function coerceValue(raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return raw;
  if (raw === "true")  return true;
  if (raw === "false") return false;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!isNaN(n)) return n;
    }
  }
  return raw;
}

function mapRule(rule: ExtendedRule): object[] {
  const { field, op, value, value2, eventProp, eventPropOp, eventPropValue } = rule;

  // ── in_segment ──────────────────────────────────────────────────────────────
  if (field.startsWith("in_segment:")) {
    const segmentId = field.replace(/^in_segment:/, "");
    return [{ type: "in_segment", segment_id: segmentId }];
  }

  // ── derived rule ────────────────────────────────────────────────────────────
  if (field.startsWith("derived:")) {
    const ruleId = field.replace(/^derived:/, "");
    const parameters = Object.fromEntries(
      Object.entries(rule.derivedParams ?? {}).map(([k, v]) => {
        const raw = typeof v === "object" ? v.value : String(v ?? "");
        return [k, coerceValue(raw)];
      })
    );
    return [{ type: "derived", rule_id: ruleId, parameters }];
  }

  // ── event ───────────────────────────────────────────────────────────────────
  if (field.startsWith("event:")) {
    const eventName = toSnakeCase(field.replace(/^event:/, ""));
    // Build where-conditions: always include the key even when empty
    const where: Record<string, { op: string; value: unknown }> = {};
    if (eventProp) {
      where[eventProp] = {
        op:    eventPropOp ?? "eq",
        value: coerceValue(eventPropValue),   // e.g. "true" → true, "42" → 42
      };
    }
    return [{
      type:        "event",
      event_name:  eventName,
      where,                                  // always present (empty {} or filled)
      frequency:   { op: OP_MAP[op] ?? op, count: Number(value) || 0 },
      time_window: { last_days: Number(value2) || 1 },
    }];
  }

  // ── trait ───────────────────────────────────────────────────────────────────
  if (op === "WITHIN" || op === "NOT_WITHIN" || op === "BEFORE") {
    const days = typeof value === "string" ? parseInt(value, 10) : Number(value);
    const iso = daysAgoISO(days);
    const backendOp = op === "BEFORE" ? "lte" : op === "NOT_WITHIN" ? "lt" : "gte";
    return [{ type: "trait", trait: field, op: backendOp, value: iso }];
  }

  // between: two separate gte / lte filters (handles both "BETWEEN" and "between")
  if ((op === "BETWEEN" || op === "between") && value2 !== undefined && value2 !== "") {
    return [
      { type: "trait", trait: field, op: "gte", value: coerceValue(value) },
      { type: "trait", trait: field, op: "lte", value: coerceValue(value2) },
    ];
  }

  // exists: no value
  if (op === "exists" || op === "EXISTS") {
    return [{ type: "trait", trait: field, op: "exists" }];
  }

  return [{ type: "trait", trait: field, op: OP_MAP[op] ?? op, value: coerceValue(value) }];
}

function buildDSL(payload: {
  combinator: "AND" | "OR";
  rules: ExtendedRule[];
}): object {
  return {
    version: 1,
    match: payload.combinator === "AND" ? "all" : "any",
    filters: payload.rules.flatMap(mapRule),
  };
}

// ── Preview evaluate ──────────────────────────────────────────────────────────

export async function previewEvaluate(payload: {
  combinator: "AND" | "OR";
  rules: ExtendedRule[];
}): Promise<{ size: number; computed_at: string }> {
  const dsl = buildDSL(payload) as { version: number; match: string; filters: object[] };
  const res = await fetch(`${SEG_API}/evaluate`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ match: dsl.match, filters: dsl.filters }),
  });
  if (!res.ok) throw new Error(`previewEvaluate failed: ${res.status}`);
  return res.json();
}

// ── Segment CRUD ──────────────────────────────────────────────────────────────

export async function fetchSegments(): Promise<Segment[]> {
  const res = await fetch(`${SEG_API}/segments`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchSegments failed: ${res.status}`);
  const data = await res.json();
  return data.map(toSegment);
}

export async function createSegment(payload: {
  name: string;
  description: string;
  combinator: "AND" | "OR";
  rules: ExtendedRule[];
  refresh_strategy?: string;
  scheduled_cron?: string;
  created_by?: string | null;
  /** "filter" = JSON conditions payload (default); "custom" = CSV multipart upload */
  segmentType?: "filter" | "custom";
  csvFile?: File;
}): Promise<Segment> {
  /* ── CSV / custom type — multipart/form-data ── */
  if (payload.segmentType === "custom" && payload.csvFile) {
    const form = new FormData();
    form.append("name",             payload.name);
    form.append("type",             "custom");
    form.append("refresh_strategy", payload.refresh_strategy ?? "scheduled");
    if (payload.created_by)        form.append("created_by", payload.created_by);
    if (payload.scheduled_cron)    form.append("scheduled_cron", payload.scheduled_cron);
    form.append("file", payload.csvFile);

    const res = await fetch(`${SEG_API}/segments`, {
      method: "POST",
      // Do NOT set Content-Type — browser sets it automatically with boundary
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    if (!res.ok) throw new Error(`createSegment (csv) failed: ${res.status}`);
    return toSegment(await res.json());
  }

  /* ── Filter type — application/json ── */
  const body: Record<string, unknown> = {
    name:             payload.name,
    type:             "filter",
    rule:             buildDSL(payload),
    refresh_strategy: payload.refresh_strategy ?? "scheduled",
    created_by:       payload.created_by ?? null,
  };
  if (payload.scheduled_cron) body.scheduled_cron = payload.scheduled_cron;

  const res = await fetch(`${SEG_API}/segments`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createSegment failed: ${res.status}`);
  return toSegment(await res.json());
}

export async function getSegment(segmentId: string): Promise<Segment> {
  const res = await fetch(`${SEG_API}/segments/${segmentId}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getSegment failed: ${res.status}`);
  return toSegment(await res.json());
}

export async function updateSegment(
  segmentId: string,
  payload: {
    name?: string;
    combinator?: "AND" | "OR";
    rules?: SegmentRule[];
    refresh_strategy?: "scheduled" | "on_event" | "one_time";
    scheduled_cron?: string;
  }
): Promise<Segment> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.refresh_strategy !== undefined) body.refresh_strategy = payload.refresh_strategy;
  if (payload.scheduled_cron !== undefined) body.scheduled_cron = payload.scheduled_cron;
  if (payload.rules !== undefined && payload.combinator !== undefined) {
    body.rule = buildDSL({ combinator: payload.combinator, rules: payload.rules });
  }
  const res = await fetch(`${SEG_API}/segments/${segmentId}`, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateSegment failed: ${res.status}`);
  return toSegment(await res.json());
}

export async function deleteSegment(segmentId: string): Promise<void> {
  const res = await fetch(`${SEG_API}/segments/${segmentId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`deleteSegment failed: ${res.status}`);
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function fetchSegmentMembers(
  segmentId: string,
  cursor?: string,
  limit = 50
): Promise<MemberPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`${SEG_API}/segments/${segmentId}/members?${params}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`fetchSegmentMembers failed: ${res.status}`);
  return res.json();
}

export async function checkMembership(
  segmentId: string,
  userId: string
): Promise<MembershipCheck> {
  const res = await fetch(`${SEG_API}/segments/${segmentId}/members/${encodeURIComponent(userId)}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`checkMembership failed: ${res.status}`);
  return res.json();
}

// ── Evaluate ──────────────────────────────────────────────────────────────────

export async function evaluateSegment(segmentId: string): Promise<EvaluateResult> {
  const res = await fetch(`${SEG_API}/segments/${segmentId}/evaluate`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`evaluateSegment failed: ${res.status}`);
  return res.json();
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export interface MetaEventsRaw {
  raw_events: string[];
  derived_rules: string[];
}

export async function fetchMetaEvents(projectId: string): Promise<MetaEventsRaw> {
  const res = await fetch(`${SEG_API}/meta/events?project_id=${projectId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`fetchMetaEvents failed: ${res.status}`);
  return res.json();
}

export async function fetchMetaEventProperties(
  projectId: string,
  eventName: string
): Promise<string[]> {
  const res = await fetch(
    `${SEG_API}/meta/events/${encodeURIComponent(eventName)}/properties?project_id=${projectId}`,
    { headers: authHeader() }
  );
  if (!res.ok) throw new Error(`fetchMetaEventProperties failed: ${res.status}`);
  return res.json();
}

export async function fetchMetaTraits(projectId: string): Promise<string[]> {
  const res = await fetch(`${SEG_API}/meta/traits?project_id=${projectId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`fetchMetaTraits failed: ${res.status}`);
  return res.json();
}

export async function fetchMetaOperators(): Promise<MetaOperators> {
  const res = await fetch(`${SEG_API}/meta/operators`, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchMetaOperators failed: ${res.status}`);
  return res.json();
}

export async function fetchTraitOperators(trait: string): Promise<TraitOperatorsResponse> {
  const res = await fetch(
    `${SEG_API}/meta/traits/${encodeURIComponent(trait)}/operators`,
    { headers: authHeader() }
  );
  if (!res.ok) throw new Error(`fetchTraitOperators failed: ${res.status}`);
  return res.json();
}

export async function fetchDerivedRuleConfig(ruleName: string): Promise<DerivedRuleConfig> {
  const res = await fetch(
    `${SEG_API}/meta/events/derived/${encodeURIComponent(ruleName)}`,
    { headers: authHeader() }
  );
  if (!res.ok) throw new Error(`fetchDerivedRuleConfig failed: ${res.status}`);
  return res.json();
}

export async function fetchDerivedRuleParamOperators(
  ruleName: string,
  paramName: string
): Promise<ParameterOperatorsResponse> {
  const res = await fetch(
    `${SEG_API}/meta/events/${encodeURIComponent(ruleName)}/properties/${encodeURIComponent(paramName)}/operators`,
    { headers: authHeader() }
  );
  if (!res.ok) throw new Error(`fetchDerivedRuleParamOperators failed: ${res.status}`);
  return res.json();
}
