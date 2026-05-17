// ── Shared ────────────────────────────────────────────────────────────────────

export type ApplicabilityFrequency = 'EVERYTIME' | 'ONCE' | 'MONTHLY' | 'WEEKLY'
export type TriggerType = 'DEPOSIT' | 'REGISTRATION' | 'MANUAL' | 'REFERRAL' | 'PROMO_CODE' | 'MILESTONE'
export type EligibilityValueType = 'STRING' | 'INT' | 'DECIMAL' | 'BOOLEAN' | 'JSON'
export type OwnerRole = 'OPS_LEAD' | 'CAMPAIGN_MANAGER' | 'FINANCE_APPROVER' | 'ESCALATION_CONTACT'
export type BudgetPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface OwnerEntry {
  username: string
  role: OwnerRole
  active: boolean
}

export interface BudgetEntry {
  period_type: BudgetPeriod
  limit: string | null
  used: string
  reset_at: string | null
}

// ── Bonus Head ────────────────────────────────────────────────────────────────

export interface SubheadSummary {
  id: number
  name: string
  description: string | null
  active: boolean
  owner: string
}

export interface BonusHeadResponse {
  id: number
  site_id: number
  name: string
  description: string | null
  active: boolean
  owner: string
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface BonusHeadDetail extends BonusHeadResponse {
  owners: OwnerEntry[]
  subheads: SubheadSummary[]
  budget: BudgetEntry[]
}

export interface BonusHeadCreate {
  site_id: number
  name: string
  description?: string | null
  active?: boolean
  owner: string
  created_by: string
}

export interface BonusHeadUpdate {
  name?: string | null
  description?: string | null
  active?: boolean | null
  owner?: string | null
  updated_by: string
}

export interface OwnersUpsertRequest {
  owners: { username: string; role: OwnerRole; active?: boolean }[]
  updated_by: string
}

export interface LimitsUpsertRequest {
  limits: { period_type: BudgetPeriod; budget_limit?: number | null }[]
  updated_by: string
}

// ── Bonus Subhead ─────────────────────────────────────────────────────────────

export interface ConfigureSummary {
  id: number
  name: string
  applicability_frequency: ApplicabilityFrequency
  active: boolean
  priority: number
}

export interface BonusSubheadResponse {
  id: number
  head_id: number
  site_id: number
  name: string
  description: string | null
  active: boolean
  owner: string
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface BonusSubheadDetail extends BonusSubheadResponse {
  owners: OwnerEntry[]
  budget: BudgetEntry[]
}

export interface BonusSubheadCreate {
  head_id: number
  site_id: number
  name: string
  description?: string | null
  active?: boolean
  owner: string
  created_by: string
}

export interface BonusSubheadUpdate {
  name?: string | null
  description?: string | null
  active?: boolean | null
  owner?: string | null
  updated_by: string
}

// ── Bonus Configure ───────────────────────────────────────────────────────────

export interface BonusCodeSummary {
  id: number
  code: string
  max_amount: string | null
  valid_from: string | null
  valid_to: string | null
  auto_apply: boolean
  display_order: number
  active: boolean
}

export interface BonusConfigureResponse {
  id: number
  subhead_id: number
  site_id: number
  name: string
  description: string | null
  applicability_frequency: ApplicabilityFrequency
  start_date: string
  end_date: string
  wager_multiplier: string
  no_of_chunks: number
  release_bucket: string | null
  chunk_expiry_days: number | null
  bonus_expiry_days: number | null
  wager_chip_type: string
  credit_chip_type: string
  bonus_amount_fixed: string | null
  bonus_amount_percent: string | null
  bonus_amount_max: string | null
  priority: number
  active: boolean
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface BonusConfigureDetail extends BonusConfigureResponse {
  codes: BonusCodeSummary[]
}

export interface BonusConfigureCreate {
  subhead_id: number
  site_id: number
  name: string
  description?: string | null
  applicability_frequency?: ApplicabilityFrequency
  start_date: string
  end_date: string
  wager_multiplier?: number
  no_of_chunks?: number
  release_bucket?: string | null
  chunk_expiry_days?: number | null
  bonus_expiry_days?: number | null
  wager_chip_type?: string
  credit_chip_type?: string
  bonus_amount_fixed?: number | null
  bonus_amount_percent?: number | null
  bonus_amount_max?: number | null
  priority?: number
  active?: boolean
  created_by: string
}

export interface BonusConfigureUpdate {
  name?: string | null
  description?: string | null
  applicability_frequency?: ApplicabilityFrequency | null
  start_date?: string | null
  end_date?: string | null
  wager_multiplier?: number | null
  no_of_chunks?: number | null
  release_bucket?: string | null
  chunk_expiry_days?: number | null
  bonus_expiry_days?: number | null
  wager_chip_type?: string | null
  credit_chip_type?: string | null
  bonus_amount_fixed?: number | null
  bonus_amount_percent?: number | null
  bonus_amount_max?: number | null
  priority?: number | null
  active?: boolean | null
  updated_by: string
}

// ── Eligibility ───────────────────────────────────────────────────────────────

export interface BonusEligibilityResponse {
  id: number
  configure_id: number
  site_id: number
  eligibility_key: string
  eligibility_value: string
  eligibility_value_type: EligibilityValueType
  description: string | null
  active: boolean
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface BonusEligibilityCreate {
  configure_id: number
  site_id: number
  eligibility_key: string
  eligibility_value: string
  eligibility_value_type: EligibilityValueType
  description?: string | null
  active?: boolean
  created_by: string
}

export interface BonusEligibilityUpdate {
  eligibility_key?: string | null
  eligibility_value?: string | null
  eligibility_value_type?: EligibilityValueType | null
  description?: string | null
  active?: boolean | null
  updated_by: string
}

// ── Release Trigger ───────────────────────────────────────────────────────────

export interface BonusReleaseTriggerResponse {
  id: number
  configure_id: number
  site_id: number
  trigger_type: TriggerType
  description: string | null
  min_trigger_amount: string | null
  max_trigger_amount: string | null
  payment_method: string | null
  product: string | null
  occurrence: number
  trigger_config: Record<string, unknown> | null
  active: boolean
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface BonusReleaseTriggerCreate {
  site_id: number
  code: string
  trigger_type: TriggerType
  description?: string | null
  min_trigger_amount?: number | null
  max_trigger_amount?: number | null
  payment_method?: string | null
  product?: string | null
  occurrence?: number
  trigger_config?: Record<string, unknown> | null
  active?: boolean
  created_by: string
}

export interface BonusReleaseTriggerUpdate {
  trigger_type?: TriggerType | null
  description?: string | null
  min_trigger_amount?: number | null
  max_trigger_amount?: number | null
  payment_method?: string | null
  product?: string | null
  occurrence?: number | null
  trigger_config?: Record<string, unknown> | null
  active?: boolean | null
  updated_by: string
}

// ── API error shape ───────────────────────────────────────────────────────────

export interface ApiValidationError {
  detail: { field: string; message: string }[] | string
}
