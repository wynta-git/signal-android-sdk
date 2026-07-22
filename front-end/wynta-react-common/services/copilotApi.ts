import type { CopilotContext } from '../types';

const COPILOT_API_BASE = process.env.NEXT_PUBLIC_COPILOT_API_URL as string;

const authHeader = (token: string | null) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

interface CopilotAskResponse {
  answer: string;
}

export async function sendCopilotMessage(
  text: string,
  context: CopilotContext | null,
  token: string | null,
): Promise<string> {

  console.log("Send copilot message", text, context);

  const res = await fetch(`${COPILOT_API_BASE}/ask`, {
    method: 'POST',
    headers: authHeader(token),
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
