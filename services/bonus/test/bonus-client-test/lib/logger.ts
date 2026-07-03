import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const LOG_PATH = resolve(process.cwd(), 'logs', 'api.log');

interface ApiLogEntry {
  ts: string;
  route: string;
  method: string;
  client_id: string;
  upstream: string;
  request_headers: Record<string, string>;
  upstream_headers: Record<string, string>;
  request_body: unknown;
  response_status: number;
  response_body: unknown;
}

export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = key === 'x-s2s-client-secret' ? '[REDACTED]' : value;
  });
  return out;
}

export function logApiCall(entry: ApiLogEntry): void {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch {
    // best-effort
  }
}
