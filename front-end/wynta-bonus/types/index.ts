// ── Domain models ────────────────────────────────────────────────────────────

export interface Brand {
  name: string;
  description: string;
  site_id: number;
  color: string;
}

// ── Bonus tree ────────────────────────────────────────────────────────────────

export type OwnerRole = 'OPS_LEAD' | 'CAMPAIGN_MANAGER' | 'FINANCE_APPROVER' | 'ESCALATION_CONTACT';

export interface OwnerEntry {
  username: string;
  role: OwnerRole | string;
  active: boolean;
}

export interface SubheadSummary {
  id: number;
  name: string;
  description: string;
  active: boolean;
  owner: string;
}

export interface BudgetPeriod {
  period_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  period_value?: string;
  limit?: string | number | null;
  used?: string | number;
  budget_limit?: number | null;
  budget_used?: number;
  reset_at?: string;
}

export interface BonusHead {
  id: number;
  site_id: number | string;
  name: string;
  description: string;
  owner: string;
  head_type?: string;
  active: boolean;
  updated_at?: string;
  subheads: SubheadSummary[];
  owners: OwnerEntry[];
  budget: BudgetPeriod[];
}

export interface PromoCode {
  id: string | number;
  configure_id: number;
  site_id?: number;
  code?: string;
  max_amount?: string | number | null;
  valid_from?: string | null;
  valid_to?: string | null;
  display_title?: string | null;
  display_description?: string | null;
  terms_url?: string | null;
  banner_image_url?: string | null;
  badge_text?: string | null;
  cta_text?: string | null;
  auto_apply?: boolean;
  display_order?: number;
  display_on?: string;
  min_display_amount?: string | number | null;
  active?: boolean;
  status?: string;
  issued?: number;
  redeemed?: number;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Trigger {
  id: number;
  configure_id?: number;
  trigger_type: string;
  trigger_config?: Record<string, unknown> | null;
  active?: boolean;
  [key: string]: unknown;
}

export interface EligibilityRule {
  id: number;
  configure_id?: number;
  key?: string;
  rule_type?: string;
  rule_value?: string | number;
  value?: string | number;
  value_type?: string;
  description?: string;
  active?: boolean;
}

export interface BonusConfigure {
  id: number;
  subhead_id: number;
  site_id?: string | number;
  name: string;
  description?: string;
  active: boolean;
  priority?: number;
  applicability_frequency?: string;
  start_date?: string;
  end_date?: string;
  wager_multiplier?: number;
  no_of_chunks?: number;
  bonus_amount_fixed?: string | null;
  bonus_amount_percent?: string | null;
  bonus_amount_max?: string | null;
  cashback_bonus_amount_fixed?: string | null;
  cashback_bonus_amount_percent?: string | null;
  cashback_bonus_amount_max?: string | number | null;
  wager_chip_type?: string;
  credit_chip_type?: string;
  release_bucket?: string | null;
  chunk_expiry_days?: number;
  bonus_expiry_days?: number;
  budget?: BudgetPeriod[];
  promo_codes: PromoCode[];
  codes?: PromoCode[];
  triggers: Trigger[];
  eligibilities: EligibilityRule[];
  eligibility?: EligibilityRule[];
}

export interface BonusSubhead {
  id: number;
  head_id?: number;
  parent_head_id?: number;
  parent_head_name?: string;
  name: string;
  description?: string;
  owner: string;
  active: boolean;
  updated_at?: string;
  owners?: OwnerEntry[];
  budget?: BudgetPeriod[];
  configures: (number | BonusConfigure)[];
}

// ── KPI ───────────────────────────────────────────────────────────────────────

export interface KpiSnapshot {
  active_heads: number;
  active_subheads: number;
  active_configures: number;
  active_codes: number;
  monthly_released: number;
  monthly_limit: number;
  monthly_pct: number;
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

// ── Segment rule builder ──────────────────────────────────────────────────────

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

// ── History ───────────────────────────────────────────────────────────────────

export interface HistoryEvent {
  id: string | number;
  entity_type?: string;
  entity_id?: number;
  action: string;
  changed_by?: string;
  actor?: string;
  changed_at?: string;
  timestamp?: string;
  changes?: Record<string, unknown>;
  field?: string;
  before?: unknown;
  after?: unknown;
}

// ── Usage / Budget ────────────────────────────────────────────────────────────

export interface UsagePeriod {
  id: string;
  label: string;
  factor: number;
  hint: string;
}

export interface UsageEntry {
  label: string;
  used: number;
  limit?: number;
  period?: string;
}

// ── UI State ──────────────────────────────────────────────────────────────────

export type NodeType = 'head' | 'subhead' | 'configure';

export interface SelectedNode {
  type: NodeType;
  id: number;
}

export type DrawerType =
  | 'NEW_HEAD'
  | 'EDIT_HEAD'
  | 'NEW_SUBHEAD'
  | 'EDIT_SUBHEAD'
  | 'NEW_CONFIGURE'
  | 'EDIT_CONFIGURE'
  | 'NEW_PROMOCODE'
  | 'EDIT_PROMOCODE'
  | 'CLONE_PROMOCODE'
  | 'NEW_ELIGIBILITY'
  | 'NEW_TRIGGER'
  | 'EDIT_TRIGGER'
  | 'EDIT_BUDGET'
  | 'EDIT_OWNERS'
  | 'NEW_MANUAL_BONUS'
  | 'ISSUE_CODE_BONUS';

export interface DrawerState {
  type: DrawerType;
  id?: number;
  parentId?: number;
  scope?: 'head' | 'subhead' | 'configure';
  trigger?: Record<string, unknown>;
}

export interface ContextMenuState {
  x: number;
  y: number;
  type: NodeType;
  id: number;
}

export interface HistoryDrawerState {
  type: NodeType;
  id: number;
}

// ── System users ─────────────────────────────────────────────────────────────

export type UserType =
  | 'ACCOUNT_MANAGER'
  | 'MARKETING_MANAGER'
  | 'FINANCE_MANAGER'
  | 'OPS_LEAD'
  | 'CAMPAIGN_MANAGER'
  | 'ADMIN'
  | 'ANALYST'
  | 'SUPPORT'
  | 'BRAND_MANAGER'
  | 'PRODUCT_MANAGER';

export interface SystemUser {
  id: number;
  username: string;
  email: string;
  user_type: UserType;
}

// ── Redux store shape ─────────────────────────────────────────────────────────

export type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface NormalizedState<T> {
  ids: number[];
  entities: Record<number, T>;
  status: AsyncStatus;
  error?: string | null;
}
