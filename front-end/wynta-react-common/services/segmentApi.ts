import type { Segment, SegmentRule } from "../types";

const BASE = process.env.NEXT_PUBLIC_SEG_API_URL || "http://localhost:8003";
const SEG_API = `${BASE}/api/v1/segments`;

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.NEXT_PUBLIC_SEG_TOKEN ?? ""}`,
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
}): Segment {
  return {
    id: s.segment_id,
    label: s.name,
    count: s.members_count ?? 0,
    last_used_at: s.last_refresh_time ?? undefined,
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

function mapRule(rule: SegmentRule): object[] {
  const { field, op, value, value2 } = rule;
  if (op === "WITHIN" || op === "NOT_WITHIN" || op === "BEFORE") {
    const days = typeof value === "string" ? parseInt(value, 10) : Number(value);
    const iso = daysAgoISO(days);
    const backendOp = op === "BEFORE" ? "lte" : op === "NOT_WITHIN" ? "lt" : "gte";
    return [{ type: "trait", trait: field, op: backendOp, value: iso }];
  }
  if (op === "BETWEEN" && value2 !== undefined) {
    return [
      { type: "trait", trait: field, op: "gte", value },
      { type: "trait", trait: field, op: "lte", value: value2 },
    ];
  }
  return [{ type: "trait", trait: field, op: OP_MAP[op] ?? op, value }];
}

function buildDSL(payload: {
  combinator: "AND" | "OR";
  rules: SegmentRule[];
}): object {
  return {
    version: 1,
    match: payload.combinator === "AND" ? "all" : "any",
    filters: payload.rules.flatMap(mapRule),
  };
}

// ── Segment CRUD ──────────────────────────────────────────────────────────────

export async function fetchSegments(): Promise<Segment[]> {
  const res = await fetch(SEG_API, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchSegments failed: ${res.status}`);
  const data = await res.json();
  return data.map(toSegment);
}

export async function createSegment(payload: {
  name: string;
  description: string;
  combinator: "AND" | "OR";
  rules: SegmentRule[];
}): Promise<Segment> {
  const body = {
    segment_id: slugify(payload.name),
    name: payload.name,
    rule: buildDSL(payload),
    refresh_strategy: "one_time",
    created_by: null,
  };
  const res = await fetch(SEG_API, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createSegment failed: ${res.status}`);
  return toSegment(await res.json());
}

export async function getSegment(segmentId: string): Promise<Segment> {
  const res = await fetch(`${SEG_API}/${segmentId}`, { headers: authHeader() });
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
  const res = await fetch(`${SEG_API}/${segmentId}`, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateSegment failed: ${res.status}`);
  return toSegment(await res.json());
}

export async function deleteSegment(segmentId: string): Promise<void> {
  const res = await fetch(`${SEG_API}/${segmentId}`, {
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
  const res = await fetch(`${SEG_API}/${segmentId}/members?${params}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`fetchSegmentMembers failed: ${res.status}`);
  return res.json();
}

export async function checkMembership(
  segmentId: string,
  userId: string
): Promise<MembershipCheck> {
  const res = await fetch(`${SEG_API}/${segmentId}/members/${encodeURIComponent(userId)}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`checkMembership failed: ${res.status}`);
  return res.json();
}

// ── Evaluate ──────────────────────────────────────────────────────────────────

export async function evaluateSegment(segmentId: string): Promise<EvaluateResult> {
  const res = await fetch(`${SEG_API}/${segmentId}/evaluate`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`evaluateSegment failed: ${res.status}`);
  return res.json();
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export async function fetchMetaEvents(projectId: string): Promise<string[]> {
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
