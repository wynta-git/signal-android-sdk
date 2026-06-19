import { createHmac } from 'node:crypto';

export function buildS2SHeaders(
  clientId: string,
  secret: string,
  method: string,
  queryString: string,
  bodyJson: string | null,
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = method === 'POST' ? (bodyJson ?? '') : '';
  const qs = queryString ?? '';
  const canonical = `${clientId}\n${timestamp}\n${qs}\n${rawBody}`;
  const signature = createHmac('sha256', secret).update(canonical).digest('hex');
  return {
    'x-client-id': clientId,
    'x-timestamp': timestamp,
    'x-signature': signature,
    'Content-Type': 'application/json',
  };
}
