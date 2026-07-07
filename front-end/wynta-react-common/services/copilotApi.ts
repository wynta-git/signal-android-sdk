// Mock AI Co-pilot backend. Replace sendCopilotMessage with a real endpoint
// call (NEXT_PUBLIC_COPILOT_API_URL, Bearer token via tokenRegistry) when one exists.

export interface CopilotSuggestion {
  emoji: string;
  text: string;
}

export const COPILOT_SUGGESTIONS: CopilotSuggestion[] = [
  { emoji: '📊', text: "What's the status of the Q3 campaign?" },
  { emoji: '⚠️', text: 'Any alerts I should know about today?' },
  { emoji: '🎯', text: 'Who are our top VIPs at risk this week?' },
  { emoji: '💰', text: 'How is the bonus budget tracking this month?' },
];

const CANNED: { pattern: RegExp; reply: string }[] = [
  {
    pattern: /campaign/i,
    reply:
      'The Q3 Re-engagement campaign is live across 2 brands. So far it has reached 12,480 players with a 34% open rate and 6.2% conversion — tracking 8% ahead of the Q2 benchmark. The next scheduled send goes out tomorrow at 10:00 IST.',
  },
  {
    pattern: /alert|issue|problem|wrong/i,
    reply:
      'You have 2 active alerts today:\n\n1. Bonus budget for "Casino / Weekend Reload" has crossed 85% utilisation.\n2. Event ingestion lag briefly exceeded 5 minutes at 03:12 IST (recovered).\n\nNothing currently requires manual intervention.',
  },
  {
    pattern: /vip|at risk|churn/i,
    reply:
      '7 VIP players show churn-risk signals this week — no deposits in 10+ days combined with a 60% drop in session time. The top three by lifetime GGR are P-10442, P-9877 and P-11209. A win-back segment covering all 7 is ready if you want to target them.',
  },
  {
    pattern: /budget|spend|cost/i,
    reply:
      'Bonus budget utilisation this month is at 62% (₹18.6L of ₹30L) with 9 days remaining. Sportsbook is pacing normally, but Casino reload bonuses are running ~15% hotter than forecast — worth a look before the weekend peak.',
  },
];

const FALLBACK =
  "I can help with campaigns, bonuses, player segments and product performance. I don't have live data wired up for that question yet — try asking about campaign status, alerts, at-risk VIPs or bonus budgets.";

const REPLY_DELAY_MS = 900;

export async function sendCopilotMessage(text: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, REPLY_DELAY_MS));
  const match = CANNED.find((c) => c.pattern.test(text));
  return match ? match.reply : FALLBACK;
}
