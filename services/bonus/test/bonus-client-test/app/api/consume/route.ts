import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { buildS2SHeaders } from '@/lib/s2s';
import { logApiCall, sanitizeHeaders } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientId = request.headers.get('x-s2s-client-id') ?? '';
  const secret = request.headers.get('x-s2s-client-secret') ?? '';
  const bodyJson = await request.text();
  const upstream = `${process.env.BONUS_API_URL}/api/v1/bonus/user-bonuses/consume`;
  const upstreamHeaders = buildS2SHeaders(clientId, secret, 'POST', '', bodyJson);
  const res = await fetch(upstream, { method: 'POST', headers: upstreamHeaders, body: bodyJson });
  const data: unknown = await res.json();
  logApiCall({
    ts: new Date().toISOString(),
    route: '/api/consume',
    method: 'POST',
    client_id: clientId,
    upstream,
    request_headers: sanitizeHeaders(request.headers),
    upstream_headers: upstreamHeaders,
    request_body: JSON.parse(bodyJson || 'null') as unknown,
    response_status: res.status,
    response_body: data,
  });
  return NextResponse.json(data, { status: res.status });
}
