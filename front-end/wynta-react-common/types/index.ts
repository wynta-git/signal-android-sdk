// Export shared types here

// ── Segments & Players ────────────────────────────────────────────────────────

export interface Segment {
  id: string | number;
  label?: string;
  name?: string;
  count: number;
  hint?: string;
  description?: string;
  last_used_at?: string;
  use_count?: number;
  owner?: string;
}

export interface Player {
  id: number;
  name: string;
  email: string;
  phone: string;
  state: string;
  country: string;
  tier: string;
  kyc: string;
  lifetimeDep: number;
  lifetimeWager: number;
  lifetimeGgr: number;
  totalBonuses: number;
  sessions7: number;
  daysAgoReg: number;
  daysAgoLogin: number;
  product: string;
}

export interface PlayerPage {
  players: Player[];
  page: number;
  pageTotal: number;
  total: number;
  scopeNote: string;
}

export interface SegmentField {
  id: string;
  label: string;
  type: 'enum' | 'amount' | 'number' | 'recency';
  options?: string[];
}

export interface SegmentOp {
  id: string;
  label: string;
}

export interface SegmentRule {
  field: string;
  op: string;
  value: string | string[];
  value2?: string;
}

export interface ManualSegment {
  id: string;
  label: string;
  count: number;
  hint: string;
  last_used_at: string;
  use_count: number;
  owner: string;
}
