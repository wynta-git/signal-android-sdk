import { getToken } from './tokenRegistry';

const AUTH_API =
  (process.env.NEXT_PUBLIC_AUTH_API_URL || "http://3.7.48.14:8002") +
  "/api/v1/system";

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PamUserSegmentInfo {
  segment_id: string;
  name: string | null;
}

export interface PamUserTraits {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  country?: string;
  currency?: string;
  language?: string;
  date_of_birth?: string;
  registration_date?: string;
  account_status?: string;
  kyc_status?: string;
  vip_level?: string;
  [key: string]: unknown;
}

export interface PamUser {
  user_id: string;
  pam_id: number | null;
  brand_id: string | null;
  joined_at: string | null;
  traits: PamUserTraits;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface SegmentUserPage {
  segment_id: string;
  users: PamUser[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface PamUserProfile {
  user_id: string;
  pam_id: number | null;
  brand_id: string | null;
  traits: PamUserTraits;
  first_seen_at: string | null;
  last_seen_at: string | null;
  health_status: string | null;
  segments: PamUserSegmentInfo[];
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function fetchSegmentUsers(
  segmentId: string,
  cursor?: string,
  limit = 50
): Promise<SegmentUserPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`${AUTH_API}/pam-users/segments/${segmentId}?${params}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`fetchSegmentUsers failed: ${res.status}`);
  return res.json();
}

export async function fetchUserProfile(
  userId: string,
  brandId: string
): Promise<PamUserProfile> {
  const params = new URLSearchParams({ brand_id: brandId });
  const res = await fetch(
    `${AUTH_API}/pam-users/${encodeURIComponent(userId)}?${params}`,
    { headers: authHeader() }
  );
  if (res.status === 404) throw new Error("Player profile not found");
  if (!res.ok) throw new Error(`fetchUserProfile failed: ${res.status}`);
  return res.json();
}
