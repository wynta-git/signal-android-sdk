import { getToken } from './tokenRegistry';
import type { CopilotContext } from '../types';

const COPILOT_API_BASE = process.env.NEXT_PUBLIC_COPILOT_API_URL as string;

const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

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

interface CopilotAskResponse {
  answer: string;
}

export async function sendCopilotMessage(text: string, context: CopilotContext | null): Promise<string> {

  console.log("Send copilot message", text, context);

  const res = await fetch(`${COPILOT_API_BASE}/ask`, {
    method: 'POST',
    headers: authHeader(),
    credentials: 'include',
    body: JSON.stringify({ question: text, context }),
  });

  console.log("Response: ", res);
  
  if (!res.ok) {
    throw new Error(`Copilot API error: ${res.status}`);
  }

  const data: CopilotAskResponse = await res.json();
  return data.answer;
}
