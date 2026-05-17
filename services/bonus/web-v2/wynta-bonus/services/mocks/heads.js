import { iso } from './iso.js';

export const MOCK_HEADS = {
  2: {
    id: 2,
    site_id: 'wynta-demo',
    name: 'Retention',
    description: 'Recurring incentives for active depositors — weekly reloads, cashback, loyalty milestones, leaderboards.',
    active: true,
    owner: 'demo@wynta.com',
    updated_at: iso(-1),
    owners: [
      { username: 'demo@wynta.com',    role: 'OWNER',  active: true },
      { username: 'priya@wynta.com',   role: 'EDITOR', active: true },
    ],
    subheads: [
      { id: 21, name: 'Weekly Reload Match', description: '50% match every Friday',   active: true, owner: 'demo@wynta.com' },
      { id: 22, name: 'Weekend Cashback',    description: '10% loss-back on weekends', active: true, owner: 'priya@wynta.com' },
      { id: 23, name: 'Tier Milestone',      description: 'Level-up rewards',          active: true, owner: 'demo@wynta.com' },
      { id: 24, name: 'REACTIVATION',        description: 'Reactivation incentives — birthday & loyalty rewards', active: true, owner: 'demo@wynta.com' },
      { id: 25, name: 'Leaderboard',         description: 'Weekly and seasonal leaderboard tournaments', active: true, owner: 'priya@wynta.com' },
      { id: 26, name: 'Manual Bonus',        description: 'Ad-hoc bonuses issued by marketing — new promo code per campaign', active: true, owner: 'priya@wynta.com' },
    ],
    budget: [
      { period_type: 'DAILY',   limit: '300000.00',  used: '267900.00', reset_at: iso(1) },
      { period_type: 'WEEKLY',  limit: '1500000.00', used: '1198000.00', reset_at: iso(3) },
      { period_type: 'MONTHLY', limit: '6000000.00', used: '3475250.00', reset_at: iso(15) },
    ],
  },
  4: {
    id: 4,
    site_id: 'wynta-demo',
    name: 'Acquisition',
    description: 'Acquisition bonuses for new player onboarding and first-deposit activation.',
    active: true,
    owner: 'vanessa@wynta.com',
    updated_at: iso(0),
    owners: [
      { username: 'vanessa@wynta.com', role: 'OWNER',  active: true },
      { username: 'ops@wynta.com',     role: 'EDITOR', active: true },
    ],
    subheads: [
      { id: 41, name: 'ON-BOARDING', description: 'On-boarding incentives tied to first deposit', active: true, owner: 'vanessa@wynta.com' },
    ],
    budget: [
      { period_type: 'DAILY',   limit: '100000.00',  used: '12500.00',  reset_at: iso(1) },
      { period_type: 'MONTHLY', limit: '2500000.00', used: '186400.00', reset_at: iso(15) },
    ],
  },
};
