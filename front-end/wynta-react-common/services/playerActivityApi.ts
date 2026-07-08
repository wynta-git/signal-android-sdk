import { getToken } from './tokenRegistry';

const SEG_API =
  (process.env.NEXT_PUBLIC_SEG_API_URL || "http://3.7.48.14:8003") +
  "/api/v1/segment";

const BONUS_API =
  (process.env.NEXT_PUBLIC_BONUS_API_URL || "http://localhost:8010") +
  "/api/v1/bonus";

const authHeader = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

// ── Types: user events (ClickHouse via segmentation-engine) ───────────────────

export interface UserEvent {
  event_id: string;
  event_name: string;
  timestamp: string;
  session_id: string | null;
  amount: number | null;
  currency: string | null;
  platform: string | null;
  device_type: string | null;
}

export interface UserEventsPage {
  user_id: string;
  events: UserEvent[];
  has_more: boolean;
  next_cursor: string | null;
}

// ── Types: bonus transactions (bonus service, portal routes) ─────────────────

export interface BonusTxnSummary {
  txn_id: number;
  bonus_code: string | null;
  amount: string;
  type: string;
  created_at: string;
  release_amount?: string | null;
  consumed_amount?: string | null;
  expiry_amount?: string | null;
  forfeit_amount?: string | null;
  grant_txn_id?: number | null;
}

export interface ChunkReleaseEvent {
  id: number;
  chunk_id: number;
  wager_ref: string;
  wager_amount: string;
  release_amount: string;
  created_at: string;
}

export interface ChunkConsumeEvent {
  id: number;
  chunk_id: number;
  consumed_ref: string;
  wager_ref: string;
  amount: string;
  wager_amount: string;
  consumed_amount: string;
  created_at: string;
}

export interface ChunkDetail {
  id: number;
  chunk_ref: string;
  chunk_amount: string;
  status: string;
  required_wager_amount: string;
  wager_amount: string;
  releases: ChunkReleaseEvent[];
  consumes: ChunkConsumeEvent[];
}

export interface ForfeitDetail {
  id: number;
  requested_amount: string;
  amount: string;
  type: string;
  operator: string | null;
  forfeited_at: string;
}

export interface ExpiryEvent {
  id: number;
  chunk_id: number;
  amount: string;
  type: string;
  operator: string | null;
  expired_at: string;
}

export interface GrantTxnDetail {
  type: "GRANT";
  txn_id: number;
  user_id: string;
  bonus_code: string | null;
  grant_amount: string;
  release_amount: string;
  bonus_consumed: string;
  status: string;
  wager_multiplier: string;
  no_of_chunks: number;
  chunk_expiry_days: number | null;
  bonus_expiry_days: number | null;
  wager_chip_type: string;
  credit_chip_type: string;
  created_at: string;
  chunks: ChunkDetail[];
  forfeit: ForfeitDetail | null;
  expiry_events: ExpiryEvent[];
}

export interface ChunkReleaseRow {
  id: number;
  chunk_ref: string;
  wager_amount: string;
  release_amount: string;
  bonus_grant_id: number;
}

export interface ChunkConsumedRow {
  id: number;
  chunk_ref: string;
  consumed_amount: string;
  bonus_grant_id: number;
}

export interface ReleaseTxnDetail {
  type: "RELEASE";
  id: number;
  wager_ref: string;
  chip_type: string | null;
  product: string | null;
  game_type: string | null;
  game_name: string | null;
  wager_amount: string;
  release_amount: string;
  created_at: string;
  chunks: ChunkReleaseRow[];
}

export interface ConsumeTxnDetail {
  type: "CONSUME";
  id: number;
  wager_ref: string | null;
  chip_type: string | null;
  product: string | null;
  game_type: string | null;
  game_name: string | null;
  amount: string;
  consumed_amount: string;
  wager_amount: string;
  created_at: string;
  chunks: ChunkConsumedRow[];
}

export interface ExpiryTxnDetail {
  type: "EXPIRY";
  id: number;
  chunk_id: number;
  chunk_ref: string;
  amount: string;
  expiry_type: string;
  operator: string | null;
  expired_at: string;
}

export interface ForfeitTxnDetail {
  type: "FORFEIT";
  id: number;
  bonus_grant_id: number;
  requested_amount: string;
  amount: string;
  forfeit_type: string;
  operator: string | null;
  forfeited_at: string;
}

export type TxnDetailResponse =
  | GrantTxnDetail
  | ReleaseTxnDetail
  | ConsumeTxnDetail
  | ExpiryTxnDetail
  | ForfeitTxnDetail;

export type TxnDetailType = "GRANT" | "RELEASE" | "CONSUME" | "EXPIRY" | "FORFEIT";

// ── API ───────────────────────────────────────────────────────────────────────

export async function fetchUserEvents(
  userId: string,
  opts?: { limit?: number; before?: string; brandId?: string }
): Promise<UserEventsPage> {
  const params = new URLSearchParams({ limit: String(opts?.limit ?? 20) });
  if (opts?.before) params.set("before", opts.before);
  if (opts?.brandId) params.set("brand_id", opts.brandId);
  const res = await fetch(
    `${SEG_API}/users/${encodeURIComponent(userId)}/events?${params}`,
    { headers: authHeader() }
  );
  if (!res.ok) throw new Error(`fetchUserEvents failed: ${res.status}`);
  return res.json();
}

export async function fetchPlayerBonusTransactions(
  userId: string,
  siteId: string | number,
  chipType = "cash",
  limit = 50,
  offset = 0
): Promise<BonusTxnSummary[]> {
  const params = new URLSearchParams({
    site_id: String(siteId),
    chip_type: chipType,
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(
    `${BONUS_API}/portal/user-bonuses/${encodeURIComponent(userId)}/transactions?${params}`,
    { headers: authHeader() }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`fetchPlayerBonusTransactions failed: ${res.status}`);
  return res.json();
}

export async function fetchPlayerBonusTxnDetail(
  userId: string,
  siteId: string | number,
  txnId: number,
  type: TxnDetailType
): Promise<TxnDetailResponse> {
  const params = new URLSearchParams({
    site_id: String(siteId),
    id: String(txnId),
    type,
  });
  const res = await fetch(
    `${BONUS_API}/portal/user-bonuses/${encodeURIComponent(userId)}/transaction-detail?${params}`,
    { headers: authHeader() }
  );
  if (!res.ok) throw new Error(`fetchPlayerBonusTxnDetail failed: ${res.status}`);
  return res.json();
}
