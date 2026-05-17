// Wynta Bonus Admin — shared constants

const _now = new Date('2026-05-16T12:00:00Z');
function iso(daysOffset) {
  const d = new Date(_now);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

export const PLAYER_FIRST_NAMES = [
  'Aarav','Vihaan','Aditya','Vivaan','Krishna','Arjun','Reyansh','Ayaan','Atharv','Rohan',
  'Kabir','Ishaan','Pranav','Siddharth','Karan','Rahul','Vikram','Aniket','Manish','Sandeep',
  'Saanvi','Aanya','Aadhya','Ananya','Pari','Anika','Navya','Diya','Kiara','Myra',
  'Sara','Anvi','Riya','Priya','Neha','Pooja','Meera','Kavya','Tanvi','Ishita',
];

export const PLAYER_LAST_NAMES = [
  'Sharma','Verma','Patel','Kumar','Singh','Gupta','Reddy','Iyer','Rao','Mehta',
  'Joshi','Chopra','Kapoor','Malhotra','Bansal','Agarwal','Nair','Shah','Khan','Desai',
  'Mishra','Trivedi','Bhatt','Pillai','Menon','Saxena','Tiwari','Banerjee','Mukherjee','Sinha',
];

export const PLAYER_STATES = [
  'Maharashtra','Karnataka','Gujarat','Tamil Nadu','Delhi','Telangana',
  'West Bengal','Punjab','Rajasthan','Kerala','Uttar Pradesh','Haryana',
  'Madhya Pradesh','Andhra Pradesh',
];

export const PLAYER_TIERS = ['Bronze','Silver','Gold','VIP T1','VIP T2','VIP T3'];
export const PLAYER_KYC   = ['VERIFIED','VERIFIED','VERIFIED','VERIFIED','PENDING','REJECTED'];
export const PLAYER_PRODUCTS = ['Rummy','Poker','Casino','Sports','Fantasy'];

export const PLAYERS_PAGE_SIZE   = 10;
export const PLAYERS_SEARCH_CAP  = 1000;

export const BRANDS = [
  { id: 'TR', name: 'TR Casino',      site_id: 'tr-casino', color: '#0091e0' },
  { id: 'TG', name: 'TG Sportsbook',  site_id: 'tg-sports', color: '#7c3aed' },
];

export const FREQUENCIES    = ['EVERYTIME','ONCE','MONTHLY','WEEKLY'];
export const TRIGGER_TYPES  = ['DEPOSIT','WAGER','LOSS','CODE'];
export const VALUE_TYPES    = ['STRING','NUMBER','BOOL','ENUM'];

export const USAGE_PERIODS = [
  { id: 'ALL',     label: 'All-time', factor: 1.0,   hint: 'lifetime'       },
  { id: 'MONTHLY', label: 'Monthly',  factor: 0.42,  hint: 'last 30 days'   },
  { id: 'WEEKLY',  label: 'Weekly',   factor: 0.12,  hint: 'last 7 days'    },
  { id: 'DAILY',   label: 'Daily',    factor: 0.028, hint: 'last 24 hours'  },
];

export const MANUAL_SEGMENTS = [
  { id: 'VIP_T3',         label: 'VIP Tier 3',                         count: 342,   hint: 'Top-tier active players',           last_used_at: iso(-1),  use_count: 27, owner: 'priya@wynta.com'   },
  { id: 'INACTIVE_30',    label: 'Inactive 30+ days',                  count: 1284,  hint: 'Winback candidates',                last_used_at: iso(-2),  use_count: 31, owner: 'priya@wynta.com'   },
  { id: 'TOP_RUMMY',      label: 'Top 100 Rummy players (this week)',  count: 100,   hint: 'Product-specific reward',           last_used_at: iso(-3),  use_count: 14, owner: 'arjun@wynta.com'   },
  { id: 'BIRTHDAY_MONTH', label: 'Players with birthday this month',   count: 540,   hint: 'Personal touch',                    last_used_at: iso(-4),  use_count: 12, owner: 'vanessa@wynta.com' },
  { id: 'NEW_7D',         label: 'New players (last 7 days)',          count: 692,   hint: 'Just signed up',                    last_used_at: iso(-5),  use_count: 18, owner: 'arjun@wynta.com'   },
  { id: 'VIP_T2',         label: 'VIP Tier 2',                         count: 1186,  hint: 'High-stake regulars',               last_used_at: iso(-6),  use_count: 22, owner: 'priya@wynta.com'   },
  { id: 'TOP_WAGER',      label: 'Top 100 wagerers (this month)',      count: 100,   hint: 'High-revenue cohort',               last_used_at: iso(-7),  use_count: 9,  owner: 'vanessa@wynta.com' },
  { id: 'INACTIVE_7',     label: 'Inactive 7+ days',                   count: 4118,  hint: 'Light churn risk',                  last_used_at: iso(-9),  use_count: 11, owner: 'arjun@wynta.com'   },
  { id: 'NEW_30D_NO_DEP', label: 'Registered 30d ago, no deposit',     count: 1502,  hint: 'Activation push',                   last_used_at: iso(-11), use_count: 8,  owner: 'priya@wynta.com'   },
  { id: 'KYC_IN',         label: 'All KYC-verified India players',     count: 18420, hint: 'Mass-market base',                  last_used_at: iso(-13), use_count: 6,  owner: 'vanessa@wynta.com' },
  { id: 'HIGH_LTV',       label: 'High LTV (₹1L+ lifetime)',           count: 218,   hint: 'Top-spend players',                 last_used_at: iso(-15), use_count: 7,  owner: 'priya@wynta.com'   },
  { id: 'POKER_REGS',     label: 'Poker regulars (10+ sessions/wk)',   count: 412,   hint: 'Engaged poker base',                last_used_at: iso(-18), use_count: 5,  owner: 'arjun@wynta.com'   },
  { id: 'FIRST_DEP_PEND', label: 'Signed up, first deposit pending',   count: 2870,  hint: 'Conversion push',                   last_used_at: iso(-22), use_count: 4,  owner: 'arjun@wynta.com'   },
  { id: 'WITHDRAW_PEND',  label: 'Players with pending withdrawal',    count: 89,    hint: 'Operational outreach',              last_used_at: iso(-28), use_count: 3,  owner: 'vanessa@wynta.com' },
  { id: 'MAH_KA_GUJ',     label: 'Maharashtra · Karnataka · Gujarat',  count: 8920,  hint: 'Regional campaign',                 last_used_at: iso(-34), use_count: 2,  owner: 'vanessa@wynta.com' },
  { id: 'CASINO_LAPSED',  label: 'Casino lapsed (no bet 21+ days)',    count: 1190,  hint: 'Reactivation candidates',           last_used_at: iso(-41), use_count: 2,  owner: 'priya@wynta.com'   },
  { id: 'TOURN_OPTIN',    label: 'Opted in for tournaments',           count: 5620,  hint: 'Event-driven outreach',             last_used_at: iso(-58), use_count: 1,  owner: 'arjun@wynta.com'   },
  { id: 'REFERRAL_NEW',   label: 'Joined via referral (last 30d)',     count: 348,   hint: 'Reward referrer + referee',         last_used_at: iso(-73), use_count: 1,  owner: 'vanessa@wynta.com' },
];

export const SEGMENT_FIELDS = [
  { id: 'kyc_status',       label: 'KYC status',            type: 'enum',    options: ['VERIFIED','PENDING','REJECTED','NOT_STARTED'] },
  { id: 'account_status',   label: 'Account status',        type: 'enum',    options: ['ACTIVE','SUSPENDED','CLOSED','BANNED'] },
  { id: 'tier',             label: 'Loyalty tier',          type: 'enum',    options: ['Bronze','Silver','Gold','VIP T1','VIP T2','VIP T3'] },
  { id: 'country',          label: 'Country',               type: 'enum',    options: ['India','Nepal','Bangladesh','Sri Lanka'] },
  { id: 'state',            label: 'State',                 type: 'enum',    options: ['Maharashtra','Karnataka','Gujarat','Tamil Nadu','Delhi','Telangana','West Bengal','Punjab','Rajasthan','Kerala','Uttar Pradesh'] },
  { id: 'registered',       label: 'Registered',            type: 'recency' },
  { id: 'last_login',       label: 'Last login',            type: 'recency' },
  { id: 'last_bet',         label: 'Last bet placed',       type: 'recency' },
  { id: 'last_deposit',     label: 'Last deposit',          type: 'recency' },
  { id: 'first_dep_status', label: 'First-deposit status',  type: 'enum',    options: ['MADE','PENDING'] },
  { id: 'lifetime_dep',     label: 'Lifetime deposits (₹)', type: 'amount'  },
  { id: 'lifetime_wager',   label: 'Lifetime wagered (₹)',  type: 'amount'  },
  { id: 'lifetime_ggr',     label: 'Lifetime GGR (₹)',      type: 'amount'  },
  { id: 'dep_count_30',     label: 'Deposits (last 30d)',   type: 'number'  },
  { id: 'sessions_7',       label: 'Sessions (last 7d)',    type: 'number'  },
  { id: 'product',          label: 'Played product',        type: 'enum',    options: ['Rummy','Poker','Casino','Sports','Fantasy'] },
  { id: 'birthday_month',   label: 'Birthday month',        type: 'enum',    options: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] },
  { id: 'bonus_received',   label: 'Bonus received',        type: 'recency' },
  { id: 'referral_source',  label: 'Referral source',       type: 'enum',    options: ['Organic','Friend referral','Paid social','Affiliate','SEM'] },
];

export const OPS = {
  enum:    [{ id: 'IS',         label: 'is'           }, { id: 'IS_NOT',     label: 'is not'      }, { id: 'IN',      label: 'is any of'  }, { id: 'NOT_IN',  label: 'is none of' }],
  amount:  [{ id: 'GT',         label: '>'            }, { id: 'LT',         label: '<'           }, { id: 'BETWEEN', label: 'between'    }, { id: 'EQ',      label: '='          }],
  number:  [{ id: 'GT',         label: '>'            }, { id: 'LT',         label: '<'           }, { id: 'BETWEEN', label: 'between'    }, { id: 'EQ',      label: '='          }, { id: 'GTE', label: '≥' }],
  recency: [{ id: 'WITHIN',     label: 'within last'  }, { id: 'NOT_WITHIN', label: 'not within last' }, { id: 'BEFORE', label: 'before' }],
};
