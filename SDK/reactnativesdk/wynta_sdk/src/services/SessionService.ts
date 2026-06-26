import { generateUUID } from '../utils/uuid';

// Module-level: lives for the lifetime of the app process (new value on every cold start)
let sessionId: string | null = null;

export function getSessionId(): string {
  if (!sessionId) {
    sessionId = generateUUID();
  }
  return sessionId;
}
