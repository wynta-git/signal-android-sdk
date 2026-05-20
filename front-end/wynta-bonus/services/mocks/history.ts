import { iso } from './iso';

const _now = new Date('2026-05-16T12:00:00Z');

export interface HistoryEntry {
  at: string;
  actor: string;
  kind: string;
  summary: string;
  field?: string;
  old?: string;
  new?: string;
  newValue?: string;
  reason?: string;
}

function _h(hours: number, actor: string, kind: string, summary: string, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    at: iso(0, new Date(_now.getTime() - hours * 3600000)),
    actor, kind, summary, ...extra,
  };
}

// State color tokens (for the lifecycle bar/legend).
export const STATE_META: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:   { color: 'var(--warn)',   bg: 'rgba(245,158,11,0.13)', label: 'Pending' },
  RELEASED:  { color: 'var(--blue)',   bg: 'var(--bp)',             label: 'Released' },
  CONSUMED:  { color: 'var(--ok)',     bg: 'rgba(16,185,129,0.13)', label: 'Consumed' },
  EXPIRED:   { color: 'var(--g500)',   bg: 'var(--g100)',           label: 'Expired' },
  FORFEITED: { color: 'var(--err)',    bg: 'rgba(239,68,68,0.13)',  label: 'Forfeited' },
};

export const HEAD_HISTORY: Record<number, HistoryEntry[]> = {
  1: [
    _h(48,   'vanessa@wynta.com', 'UPDATED',  'Updated daily budget limit',  { field: 'budget.DAILY.limit', old: '₹4.00L', new: '₹5.00L' }),
    _h(168,  'demo@wynta.com',    'UPDATED',  'Added owner',                 { newValue: 'ops@wynta.com · VIEWER' }),
    _h(720,  'vanessa@wynta.com', 'UPDATED',  'Updated description'),
    _h(2160, 'vanessa@wynta.com', 'ACTIVATED', 'Activated head'),
    _h(2208, 'vanessa@wynta.com', 'CREATED',  'Created bonus head',          { newValue: 'Welcome Bonus Program' }),
  ],
  2: [
    _h(24,   'demo@wynta.com',    'UPDATED',  'Updated weekly budget limit', { field: 'budget.WEEKLY.limit', old: '₹12.00L', new: '₹15.00L' }),
    _h(168,  'priya@wynta.com',   'UPDATED',  'Added owner',                 { newValue: 'priya@wynta.com · EDITOR' }),
    _h(1440, 'demo@wynta.com',    'CREATED',  'Created bonus head',          { newValue: 'Retention & Reload' }),
  ],
  3: [
    _h(120,  'priya@wynta.com',   'UPDATED',  'Removed monthly budget cap',  { field: 'budget.MONTHLY.limit', old: '₹50.00L', new: '∞' }),
    _h(2880, 'priya@wynta.com',   'CREATED',  'Created bonus head',          { newValue: 'High Roller VIP' }),
  ],
  4: [
    _h(0.5,  'vanessa@wynta.com', 'UPDATED',  'Added owner',                 { newValue: 'ops@wynta.com · EDITOR' }),
    _h(1,    'vanessa@wynta.com', 'ACTIVATED', 'Activated head'),
    _h(1.5,  'vanessa@wynta.com', 'CREATED',  'Created bonus head',          { newValue: 'ACTIVATION' }),
  ],
};

export const SUBHEAD_HISTORY: Record<number, HistoryEntry[]> = {
  11: [
    _h(48,   'vanessa@wynta.com', 'UPDATED',  'Updated daily budget limit',  { field: 'budget.DAILY.limit', old: '₹2.00L', new: '₹2.50L' }),
    _h(264,  'vanessa@wynta.com', 'UPDATED',  'Updated description'),
    _h(2208, 'vanessa@wynta.com', 'CREATED',  'Created subhead',             { newValue: 'First Deposit Match' }),
  ],
  12: [
    _h(120,  'vanessa@wynta.com', 'CREATED',  'Created subhead',             { newValue: 'Registration No-Deposit' }),
  ],
  13: [
    _h(360,  'demo@wynta.com',    'CREATED',  'Created subhead',             { newValue: 'KYC Verified Reward' }),
  ],
  14: [
    _h(960,  'ops@wynta.com',     'DEACTIVATED', 'Paused subhead',           { reason: 'pending compliance review' }),
    _h(1440, 'ops@wynta.com',     'CREATED',  'Created subhead',             { newValue: 'Referral Match' }),
  ],
  15: [
    _h(240,  'demo@wynta.com',    'CREATED',  'Created subhead',             { newValue: 'Email Verification' }),
  ],
  21: [
    _h(24,   'demo@wynta.com',    'UPDATED',  'Updated weekly budget limit', { field: 'budget.WEEKLY.limit', old: '₹6.00L', new: '₹8.00L' }),
    _h(720,  'demo@wynta.com',    'CREATED',  'Created subhead',             { newValue: 'Weekly Reload Match' }),
  ],
  22: [
    _h(48,   'priya@wynta.com',   'UPDATED',  'Updated description'),
    _h(1080, 'priya@wynta.com',   'CREATED',  'Created subhead',             { newValue: 'Weekend Cashback' }),
  ],
  23: [
    _h(168,  'demo@wynta.com',    'CREATED',  'Created subhead',             { newValue: 'Tier Milestone' }),
  ],
  31: [
    _h(120,  'priya@wynta.com',   'CREATED',  'Created subhead',             { newValue: 'Whale Welcome' }),
  ],
  32: [
    _h(72,   'priya@wynta.com',   'CREATED',  'Created subhead',             { newValue: 'High-Stakes Reload' }),
  ],
  33: [
    _h(2160, 'priya@wynta.com',   'DEACTIVATED', 'Paused subhead'),
    _h(2400, 'priya@wynta.com',   'CREATED',  'Created subhead',             { newValue: 'Birthday Drop' }),
  ],
  41: [
    _h(1,    'vanessa@wynta.com', 'ACTIVATED', 'Activated subhead'),
    _h(1.3,  'vanessa@wynta.com', 'CREATED',  'Created subhead',             { newValue: 'ON-BOARDING' }),
  ],
};

export const CONFIGURE_HISTORY: Record<number, HistoryEntry[]> = {
  111: [
    _h(1,    'vanessa@wynta.com', 'UPDATED',     'Updated bonus_amount_max',     { field: 'bonus_amount_max', old: '8000.00', new: '10000.00' }),
    _h(6,    'demo@wynta.com',    'ADDED_CODE',  'Added promo code',             { newValue: 'BIGSLOTS' }),
    _h(28,   'vanessa@wynta.com', 'UPDATED',     'Updated wager_multiplier',     { field: 'wager_multiplier', old: '25', new: '30' }),
    _h(74,   'demo@wynta.com',    'ADDED_ELIGIBILITY', 'Added eligibility',      { newValue: 'payment.method = UPI,CARD' }),
    _h(120,  'vanessa@wynta.com', 'ACTIVATED',   'Activated bonus'),
    _h(168,  'vanessa@wynta.com', 'UPDATED',     'Updated end_date',             { field: 'end_date', old: '2026-06-15', new: '2026-07-30' }),
    _h(216,  'demo@wynta.com',    'ADDED_TRIGGER', 'Added release trigger',      { newValue: 'CODE · WELCOME100' }),
    _h(264,  'vanessa@wynta.com', 'CREATED',     'Created configure',            { newValue: 'FD Match 100% — Slots' }),
  ],
  112: [
    _h(8,    'demo@wynta.com',    'UPDATED',     'Updated bonus_amount_percent', { field: 'bonus_amount_percent', old: '40', new: '50' }),
    _h(120,  'vanessa@wynta.com', 'ACTIVATED',   'Activated bonus'),
    _h(168,  'vanessa@wynta.com', 'CREATED',     'Created configure'),
  ],
  113: [
    _h(48,   'vanessa@wynta.com', 'UPDATED',     'Updated priority',             { field: 'priority', old: '5', new: '3' }),
    _h(192,  'vanessa@wynta.com', 'CREATED',     'Created configure'),
  ],
  114: [
    _h(720,  'ops@wynta.com',     'DEACTIVATED', 'Paused bonus',                 { reason: 'campaign ended' }),
    _h(4320, 'vanessa@wynta.com', 'CREATED',     'Created configure'),
  ],
  121: [
    _h(36,   'vanessa@wynta.com', 'UPDATED',     'Updated chunk_expiry_days',    { field: 'chunk_expiry_days', old: '5', new: '3' }),
    _h(264,  'vanessa@wynta.com', 'CREATED',     'Created configure'),
  ],
  122: [
    _h(96,   'vanessa@wynta.com', 'CREATED',     'Created configure'),
  ],
  131: [
    _h(216,  'demo@wynta.com',    'CREATED',     'Created configure'),
  ],
  141: [
    _h(960,  'ops@wynta.com',     'DEACTIVATED', 'Paused for compliance review'),
    _h(1440, 'ops@wynta.com',     'CREATED',     'Created configure'),
  ],
  151: [
    _h(120,  'demo@wynta.com',    'CREATED',     'Created configure'),
  ],
  211: [
    _h(4,    'demo@wynta.com',    'UPDATED',     'Updated bonus_amount_percent', { field: 'bonus_amount_percent', old: '40', new: '50' }),
    _h(72,   'priya@wynta.com',   'ADDED_CODE',  'Added promo code',             { newValue: 'FRIDAY50' }),
    _h(360,  'demo@wynta.com',    'ACTIVATED',   'Activated bonus'),
    _h(720,  'demo@wynta.com',    'CREATED',     'Created configure'),
  ],
  212: [
    _h(168,  'demo@wynta.com',    'CREATED',     'Created configure'),
  ],
  221: [
    _h(2,    'priya@wynta.com',   'UPDATED',     'Updated bonus_amount_max',     { field: 'bonus_amount_max', old: '3000.00', new: '5000.00' }),
    _h(96,   'priya@wynta.com',   'ADDED_ELIGIBILITY', 'Added eligibility',      { newValue: 'player.tier = SILVER,GOLD,PLAT' }),
    _h(1080, 'priya@wynta.com',   'CREATED',     'Created configure'),
  ],
  231: [
    _h(168,  'demo@wynta.com',    'CREATED',     'Created configure'),
  ],
  311: [
    _h(72,   'priya@wynta.com',   'UPDATED',     'Updated bonus_amount_max',     { field: 'bonus_amount_max', old: '50000.00', new: '100000.00' }),
    _h(120,  'priya@wynta.com',   'ADDED_TRIGGER', 'Added release trigger',      { newValue: 'DEPOSIT · WIRE,CRYPTO' }),
    _h(360,  'priya@wynta.com',   'CREATED',     'Created configure'),
  ],
  321: [
    _h(36,   'priya@wynta.com',   'ADDED_CODE',  'Added promo code',             { newValue: 'BIGRELOAD' }),
    _h(168,  'priya@wynta.com',   'UPDATED',     'Updated wager_multiplier',     { field: 'wager_multiplier', old: '10', new: '8' }),
    _h(720,  'priya@wynta.com',   'CREATED',     'Created configure'),
  ],
  411: [
    _h(0.5,  'vanessa@wynta.com', 'ADDED_CODE',  'Added promo code',             { newValue: 'FIRST_DEPOSIT' }),
    _h(0.8,  'vanessa@wynta.com', 'ADDED_ELIGIBILITY', 'Added eligibility',      { newValue: 'player_registered_period = CURRENT_MONTH' }),
    _h(1.2,  'vanessa@wynta.com', 'ADDED_TRIGGER', 'Added release trigger',      { newValue: 'DEPOSIT · code FIRST_DEPOSIT' }),
    _h(2,    'vanessa@wynta.com', 'ACTIVATED',   'Activated bonus'),
    _h(2.5,  'vanessa@wynta.com', 'CREATED',     'Created configure',            { newValue: 'First Deposit 200% — FIRST_DEPOSIT' }),
  ],
};

export const HISTORY_KIND_META: Record<string, { icon: string; color: string; label: string }> = {
  CREATED:           { icon: 'plus-circle',   color: 'var(--ok)',   label: 'Created' },
  UPDATED:           { icon: 'pencil',        color: 'var(--blue)', label: 'Updated' },
  ACTIVATED:         { icon: 'play-circle',   color: 'var(--ok)',   label: 'Activated' },
  DEACTIVATED:       { icon: 'pause-circle',  color: 'var(--warn)', label: 'Paused' },
  ADDED_CODE:        { icon: 'ticket',        color: 'var(--blue)', label: 'Code added' },
  ADDED_ELIGIBILITY: { icon: 'filter',        color: 'var(--blue)', label: 'Eligibility added' },
  ADDED_TRIGGER:     { icon: 'zap',           color: 'var(--blue)', label: 'Trigger added' },
};
