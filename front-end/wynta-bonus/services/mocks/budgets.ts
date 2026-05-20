import { iso } from './iso';
import type { BudgetPeriod } from '@/types';

// Configure-level budgets (cohort caps per period). Defaults to inheriting from parent if absent.
export const CONFIGURE_BUDGETS: Record<number, BudgetPeriod[]> = {
  111: [
    { period_type: 'DAILY',   limit: '150000.00', used: '92500.00',  reset_at: iso(1) },
    { period_type: 'WEEKLY',  limit: '750000.00', used: '418200.00', reset_at: iso(3) },
    { period_type: 'MONTHLY', limit: '2500000.00', used: '1284750.00', reset_at: iso(15) },
  ],
  211: [
    { period_type: 'DAILY',   limit: '80000.00',  used: '62500.00',  reset_at: iso(1) },
    { period_type: 'WEEKLY',  limit: '400000.00', used: '312000.00', reset_at: iso(3) },
    { period_type: 'MONTHLY', limit: '1500000.00', used: '910000.00', reset_at: iso(15) },
  ],
  411: [
    { period_type: 'DAILY',   limit: '50000.00',  used: '8200.00',   reset_at: iso(1) },
    { period_type: 'WEEKLY',  limit: '250000.00', used: '42400.00',  reset_at: iso(3) },
    { period_type: 'MONTHLY', limit: '1000000.00', used: '186400.00', reset_at: iso(15) },
  ],
};

// Promo-code-level budgets — only set for codes with explicit caps; otherwise inherit configure.
export const CODE_BUDGETS: Record<number, BudgetPeriod[]> = {
  1: [ // WELCOME100
    { period_type: 'DAILY',   limit: '80000.00',  used: '52000.00',  reset_at: iso(1) },
    { period_type: 'WEEKLY',  limit: '400000.00', used: '228000.00', reset_at: iso(3) },
    { period_type: 'MONTHLY', limit: '1500000.00', used: '714000.00', reset_at: iso(15) },
  ],
  6: [ // FREESPIN500
    { period_type: 'DAILY',   limit: '40000.00',  used: '37500.00',  reset_at: iso(1) },
    { period_type: 'WEEKLY',  limit: '200000.00', used: '152000.00', reset_at: iso(3) },
    { period_type: 'MONTHLY', limit: '720000.00', used: '484000.00', reset_at: iso(15) },
  ],
  11: [ // FIRST_DEPOSIT
    { period_type: 'DAILY',   limit: '50000.00',  used: '8200.00',   reset_at: iso(1) },
    { period_type: 'WEEKLY',  limit: '250000.00', used: '42400.00',  reset_at: iso(3) },
    { period_type: 'MONTHLY', limit: '1000000.00', used: '186400.00', reset_at: iso(15) },
  ],
};
