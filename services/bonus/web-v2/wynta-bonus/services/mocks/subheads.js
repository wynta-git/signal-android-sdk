import { iso } from './iso.js';

export const MOCK_SUBHEADS = {
  11: {
    id: 11, parent_head_id: 1, parent_head_name: 'Welcome Bonus Program',
    name: 'First Deposit Match', description: '100% match up to ₹10,000 for any new depositor across all approved sites.',
    active: true, owner: 'vanessa@wynta.com', updated_at: iso(-2),
    owners: [
      { username: 'vanessa@wynta.com', role: 'OWNER',  active: true },
      { username: 'demo@wynta.com',    role: 'EDITOR', active: true },
    ],
    budget: [
      { period_type: 'DAILY',   limit: '250000.00', used: '184320.00', reset_at: iso(1) },
      { period_type: 'WEEKLY',  limit: '1200000.00', used: '710500.00', reset_at: iso(3) },
      { period_type: 'MONTHLY', limit: '5000000.00', used: '2418200.00', reset_at: iso(15) },
    ],
    configures: [111, 112, 113, 114],
  },
  12: {
    id: 12, parent_head_id: 1, parent_head_name: 'Welcome Bonus Program',
    name: 'Registration No-Deposit', description: '₹500 risk-free credit awarded on email verification.',
    active: true, owner: 'vanessa@wynta.com', updated_at: iso(-1),
    owners: [{ username: 'vanessa@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'DAILY',   limit: '50000.00',  used: '37500.00',  reset_at: iso(1) },
      { period_type: 'WEEKLY',  limit: '250000.00', used: '152000.00', reset_at: iso(3) },
      { period_type: 'MONTHLY', limit: '900000.00', used: '584000.00', reset_at: iso(15) },
    ],
    configures: [121, 122],
  },
  13: {
    id: 13, parent_head_id: 1, parent_head_name: 'Welcome Bonus Program',
    name: 'KYC Verified Reward', description: '₹250 credit on successful KYC verification.',
    active: true, owner: 'demo@wynta.com', updated_at: iso(-4),
    owners: [{ username: 'demo@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'DAILY',   limit: '30000.00',  used: '12400.00',  reset_at: iso(1) },
      { period_type: 'WEEKLY',  limit: '150000.00', used: '78200.00',  reset_at: iso(3) },
      { period_type: 'MONTHLY', limit: '500000.00', used: '241800.00', reset_at: iso(15) },
    ],
    configures: [131],
  },
  14: {
    id: 14, parent_head_id: 1, parent_head_name: 'Welcome Bonus Program',
    name: 'Referral Match', description: 'Referrer + referee bonus on first deposit by invited friend.',
    active: false, owner: 'ops@wynta.com', updated_at: iso(-30),
    owners: [{ username: 'ops@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'DAILY',   limit: '20000.00',  used: '0.00',     reset_at: iso(1) },
      { period_type: 'MONTHLY', limit: '300000.00', used: '0.00',     reset_at: iso(15) },
    ],
    configures: [141],
  },
  15: {
    id: 15, parent_head_id: 1, parent_head_name: 'Welcome Bonus Program',
    name: 'Email Verification', description: 'Small reward for verifying email.',
    active: true, owner: 'demo@wynta.com', updated_at: iso(-3),
    owners: [{ username: 'demo@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'DAILY',   limit: '15000.00',  used: '8200.00',   reset_at: iso(1) },
      { period_type: 'MONTHLY', limit: '180000.00', used: '94600.00',  reset_at: iso(15) },
    ],
    configures: [151],
  },
  21: {
    id: 21, parent_head_id: 2, parent_head_name: 'Retention',
    name: 'Weekly Reload Match', description: '50% match on first deposit every Friday for active players.',
    active: true, owner: 'demo@wynta.com', updated_at: iso(-1),
    owners: [{ username: 'demo@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'DAILY',   limit: '150000.00', used: '128700.00', reset_at: iso(1) },
      { period_type: 'WEEKLY',  limit: '800000.00', used: '628000.00', reset_at: iso(3) },
      { period_type: 'MONTHLY', limit: '3000000.00', used: '1840000.00', reset_at: iso(15) },
    ],
    configures: [211, 212],
  },
  22: {
    id: 22, parent_head_id: 2, parent_head_name: 'Retention',
    name: 'Weekend Cashback', description: '10% loss-back on Sat & Sun losses, credited Monday morning.',
    active: true, owner: 'priya@wynta.com', updated_at: iso(-2),
    owners: [{ username: 'priya@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'WEEKLY',  limit: '500000.00',  used: '418000.00',  reset_at: iso(3) },
      { period_type: 'MONTHLY', limit: '2000000.00', used: '1235000.00', reset_at: iso(15) },
    ],
    configures: [221],
  },
  23: {
    id: 23, parent_head_id: 2, parent_head_name: 'Retention',
    name: 'Tier Milestone', description: 'Level-up rewards when a player crosses a loyalty tier.',
    active: true, owner: 'demo@wynta.com', updated_at: iso(-7),
    owners: [{ username: 'demo@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'MONTHLY', limit: '1000000.00', used: '400250.00', reset_at: iso(15) },
    ],
    configures: [231],
  },
  24: {
    id: 24, parent_head_id: 2, parent_head_name: 'Retention',
    name: 'REACTIVATION',
    description: 'Reactivation incentives for existing players — birthday and loyalty rewards.',
    active: true, owner: 'demo@wynta.com', updated_at: iso(-1),
    owners: [
      { username: 'demo@wynta.com',  role: 'OWNER',  active: true },
      { username: 'priya@wynta.com', role: 'EDITOR', active: true },
    ],
    budget: [
      { period_type: 'MONTHLY', limit: '500000.00', used: '0.00', reset_at: iso(15) },
    ],
    configures: [241],
  },
  25: {
    id: 25, parent_head_id: 2, parent_head_name: 'Retention',
    name: 'Leaderboard',
    description: 'Weekly and seasonal leaderboard tournaments — players compete on wager volume and points.',
    active: true, owner: 'priya@wynta.com', updated_at: iso(0),
    owners: [
      { username: 'priya@wynta.com', role: 'OWNER',  active: true },
      { username: 'demo@wynta.com',  role: 'EDITOR', active: true },
    ],
    budget: [
      { period_type: 'WEEKLY',  limit: '750000.00',  used: '482300.00', reset_at: iso(3) },
      { period_type: 'MONTHLY', limit: '3000000.00', used: '1924500.00', reset_at: iso(15) },
    ],
    configures: [251],
  },
  26: {
    id: 26, parent_head_id: 2, parent_head_name: 'Retention',
    name: 'Manual Bonus',
    description: 'Ad-hoc marketing bonuses. Each campaign creates a new promo code targeted at a player segment or an uploaded list of player IDs.',
    active: true, owner: 'priya@wynta.com', updated_at: iso(0),
    is_manual: true,
    owners: [
      { username: 'priya@wynta.com',   role: 'OWNER',  active: true },
      { username: 'vanessa@wynta.com', role: 'EDITOR', active: true },
      { username: 'ops@wynta.com',     role: 'EDITOR', active: true },
    ],
    budget: [
      { period_type: 'WEEKLY',  limit: '500000.00',  used: '184500.00',  reset_at: iso(3) },
      { period_type: 'MONTHLY', limit: '2000000.00', used: '728200.00',  reset_at: iso(15) },
    ],
    configures: [261],
  },
  31: {
    id: 31, parent_head_id: 3, parent_head_name: 'High Roller VIP',
    name: 'Whale Welcome', description: 'Curated sign-up bonus for verified VIPs.',
    active: true, owner: 'priya@wynta.com', updated_at: iso(-5),
    owners: [{ username: 'priya@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'MONTHLY', limit: '1500000.00', used: '824000.00', reset_at: iso(15) },
    ],
    configures: [311],
  },
  32: {
    id: 32, parent_head_id: 3, parent_head_name: 'High Roller VIP',
    name: 'High-Stakes Reload', description: 'Reload bonus tier for ₹50k+ deposits.',
    active: true, owner: 'priya@wynta.com', updated_at: iso(-3),
    owners: [{ username: 'priya@wynta.com', role: 'OWNER', active: true }],
    budget: [
      { period_type: 'MONTHLY', limit: '2000000.00', used: '1620000.00', reset_at: iso(15) },
    ],
    configures: [321],
  },
  33: {
    id: 33, parent_head_id: 3, parent_head_name: 'High Roller VIP',
    name: 'Birthday Drop', description: 'Annual VIP gift on player birthday.',
    active: false, owner: 'priya@wynta.com', updated_at: iso(-90),
    owners: [{ username: 'priya@wynta.com', role: 'OWNER', active: true }],
    budget: [],
    configures: [],
  },
  41: {
    id: 41, parent_head_id: 4, parent_head_name: 'Acquisition',
    name: 'ON-BOARDING', description: 'On-boarding incentives tied to first deposit.',
    active: true, owner: 'vanessa@wynta.com', updated_at: iso(0),
    owners: [
      { username: 'vanessa@wynta.com', role: 'OWNER', active: true },
      { username: 'ops@wynta.com',     role: 'EDITOR', active: true },
    ],
    budget: [
      { period_type: 'DAILY',   limit: '100000.00',  used: '12500.00',  reset_at: iso(1) },
      { period_type: 'MONTHLY', limit: '2500000.00', used: '186400.00', reset_at: iso(15) },
    ],
    configures: [411],
  },
};
