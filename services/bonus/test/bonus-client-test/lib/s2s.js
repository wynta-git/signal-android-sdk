import crypto from 'crypto';

export function buildS2SHeaders(clientId, secret, method, queryString, bodyJson) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody   = method === 'POST' ? (bodyJson ?? '') : '';
  const qs        = queryString ?? '';
  const canonical = `${clientId}\n${timestamp}\n${qs}\n${rawBody}`;
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return {
    'x-client-id': clientId,
    'x-timestamp':  timestamp,
    'x-signature':  signature,
    'Content-Type': 'application/json',
  };
}
