import type { BudgetPeriod } from '../types';

export type PeriodKey = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type BudgetField = 'daily' | 'weekly' | 'monthly';
export type BudgetInputs = Record<BudgetField, string>;
export type BudgetErrors = Partial<Record<BudgetField, string>>;

export const FIELD_TO_PERIOD: Record<BudgetField, PeriodKey> = {
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
};

/** Empty input means "uncapped" (null); anything else is parsed as a number. */
export const parseLimit = (raw: string): number | null =>
  raw.trim() === '' ? null : Number(raw);

/** Normalize an entity's budget periods into a DAILY/WEEKLY/MONTHLY → limit map. */
export function limitMap(budget: BudgetPeriod[] | undefined): Record<PeriodKey, number | null> {
  const map: Record<PeriodKey, number | null> = { DAILY: null, WEEKLY: null, MONTHLY: null };
  for (const p of budget ?? []) {
    const v = p.limit ?? p.budget_limit;
    map[p.period_type] = v == null || v === '' ? null : Number(v);
  }
  return map;
}

/**
 * Validate daily/weekly/monthly limit inputs.
 *
 * Rules:
 * - each value must be a number ≥ 0 (empty = uncapped)
 * - daily ≤ weekly ≤ monthly (only among the values that are set)
 * - when `parentLimits` is given (subhead under a head): each value must not
 *   exceed the parent's cap for that period, and a value is required where the
 *   parent has a cap (an uncapped subhead can't sit under a capped head).
 */
export function validateBudget(
  inputs: BudgetInputs,
  parentLimits?: Record<PeriodKey, number | null>,
): BudgetErrors {
  const errors: BudgetErrors = {};
  const fields: BudgetField[] = ['daily', 'weekly', 'monthly'];
  const values = {} as Record<BudgetField, number | null>;

  for (const f of fields) {
    const v = parseLimit(inputs[f]);
    if (v != null && (!Number.isFinite(v) || v < 0)) {
      errors[f] = 'Enter a number ≥ 0';
      values[f] = null;
    } else {
      values[f] = v;
    }
  }

  if (parentLimits) {
    for (const f of fields) {
      if (errors[f]) continue;
      const cap = parentLimits[FIELD_TO_PERIOD[f]];
      if (cap == null) continue;
      const v = values[f];
      if (v == null) errors[f] = `Required — head caps this period at ₹${cap}`;
      else if (v > cap) errors[f] = `Cannot exceed head limit of ₹${cap}`;
    }
  }

  const { daily, weekly, monthly } = values;
  if (!errors.weekly && daily != null && weekly != null && daily > weekly) {
    errors.weekly = 'Weekly limit must be ≥ daily limit';
  }
  if (!errors.monthly && weekly != null && monthly != null && weekly > monthly) {
    errors.monthly = 'Monthly limit must be ≥ weekly limit';
  }
  if (!errors.monthly && daily != null && monthly != null && daily > monthly) {
    errors.monthly = 'Monthly limit must be ≥ daily limit';
  }
  return errors;
}

/** Build the create-payload budget list; empty inputs become null (uncapped). */
export const toBudgetPayload = (inputs: BudgetInputs) => [
  { period_type: 'DAILY' as const, budget_limit: parseLimit(inputs.daily) },
  { period_type: 'WEEKLY' as const, budget_limit: parseLimit(inputs.weekly) },
  { period_type: 'MONTHLY' as const, budget_limit: parseLimit(inputs.monthly) },
];
