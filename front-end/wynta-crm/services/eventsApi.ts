import { getToken } from 'wynta-react-common/services/tokenRegistry';

const BASE    = process.env.NEXT_PUBLIC_SEG_API_URL || "http://localhost:8003";
const SEG_API = `${BASE}/api/v1/segment`;

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EventsResponse {
  raw_events:    string[];
  derived_rules: string[];
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function getEvents(projectId: string): Promise<EventsResponse> {
  const res = await fetch(
    `${SEG_API}/meta/events?project_id=${encodeURIComponent(projectId)}`,
    { headers: authHeader() },
  );
  if (!res.ok) throw new Error(`getEvents failed: ${res.status}`);
  const data = await res.json();
  // Normalise: handle both array (legacy) and { raw_events, derived_rules } shapes
  if (Array.isArray(data)) {
    return { raw_events: data as string[], derived_rules: [] };
  }
  return {
    raw_events:    data.raw_events    ?? [],
    derived_rules: data.derived_rules ?? [],
  };
}

export async function getEventProperties(
  eventName: string,
  projectId: string,
): Promise<string[]> {
  const res = await fetch(
    `${SEG_API}/meta/events/${encodeURIComponent(eventName)}/properties?project_id=${encodeURIComponent(projectId)}`,
    { headers: authHeader() },
  );
  if (!res.ok) throw new Error(`getEventProperties failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getTraits(): Promise<string[]> {
  const res = await fetch(`${SEG_API}/meta/traits`, { headers: authHeader() });
  if (!res.ok) throw new Error(`getTraits failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
