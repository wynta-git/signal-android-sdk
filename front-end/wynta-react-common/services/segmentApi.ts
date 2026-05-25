import type { Segment, SegmentRule } from "../types";

const SEG_API =
  (process.env.NEXT_PUBLIC_SEG_API_URL || "http://localhost:8003") +
  "/api/v1/segments";

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

export interface MetaOperators {
  frequency: string[];
  property: string[];
  trait: string[];
}

// ── Rule mapper ───────────────────────────────────────────────────────────────

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
    const days =
      typeof value === "string" ? parseInt(value, 10) : Number(value);
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function fetchSegments(): Promise<Segment[]> {
  const res = await fetch(SEG_API, { headers: authHeader() });
  if (!res.ok) throw new Error(`fetchSegments failed: ${res.status}`);
  const data: Array<{
    segment_id: string;
    name: string;
    members_count: number | null;
    last_refresh_time: string | null;
  }> = await res.json();
  return data.map((s) => ({
    id: s.segment_id,
    label: s.name,
    count: s.members_count ?? 0,
    last_used_at: s.last_refresh_time ?? undefined,
  }));
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
  const s = await res.json();
  return {
    id: s.segment_id,
    label: s.name,
    count: s.members_count ?? 0,
  };
}

// ── Meta API functions ────────────────────────────────────────────────────────

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
  const res = await fetch(`${SEG_API}/meta/operators`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`fetchMetaOperators failed: ${res.status}`);
  return res.json();
}

export async function fetchSegmentMembers(
  segmentId: string,
  cursor?: string
): Promise<MemberPage> {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`${SEG_API}/${segmentId}/members?${params}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`fetchSegmentMembers failed: ${res.status}`);
  return res.json();
}
