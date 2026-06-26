// Export shared types here

// ── Common ────────────────────────────────────────────────────────────────────

export interface WyntaBridge {
  token?: string;
  user?: {
    id: number;
    email: string;
    partner: string;
    pack: string;
  };
  allowed?: string[];
  is_admin?: boolean;
  site_id?: number;
}

export type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface Brand {
  name: string;
  description: string;
  site_id: number;
  color: string;
}

export interface SystemUser {
  id: number;
  display_name: string;
  role: string;
}

export interface AuthResponse {
  data: {
    token: string;
  };
}

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
  /** Raw rule DSL from the backend — preserved for edit pre-population */
  rule?: unknown;
  refresh_strategy?: string;
  scheduled_cron?: string;
  used_by_campaigns?: string[];
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
  type: 'enum' | 'amount' | 'number' | 'recency' | 'text' | 'event' | 'derived';
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
  derivedParams?: Record<string, { op: string; value: string }>;
}

// ── Segment Meta ──────────────────────────────────────────────────────────────

/** A combined event list item — raw event or derived rule */
export interface MetaEventItem {
  id: string;
  label: string;
  source: 'raw_event' | 'derived_rule';
}

/** Response from GET /meta/traits/{trait}/operators */
export interface TraitOperatorsResponse {
  operators: string[];
  type: string;
  options?: string[];
}

/** One parameter of a derived rule */
export interface DerivedRuleParameter {
  /** Canonical identifier — new API returns this as `key`, older as `name` */
  name: string;
  key?: string;
  label?: string;
  type: string;
  options?: string[];
  default_value?: string;
}

/** Response from GET /meta/events/derived/{rule_name} */
export interface DerivedRuleConfig {
  rule_name: string;
  label?: string;
  parameters: DerivedRuleParameter[];
}

/** Response from GET /meta/events/{rule_name}/properties/{param}/operators */
export interface ParameterOperatorsResponse {
  operators: string[];
  type: string;
  options?: string[];
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
