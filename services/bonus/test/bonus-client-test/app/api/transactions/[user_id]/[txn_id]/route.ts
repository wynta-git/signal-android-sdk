import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { buildS2SHeaders } from '@/lib/s2s';
import { logApiCall, sanitizeHeaders } from '@/lib/logger';

export const runtime = 'nodejs';

type Params = Promise<{ user_id: string; txn_id: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
): Promise<NextResponse> {
  const { user_id, txn_id } = await params;
  const clientId = request.headers.get('x-s2s-client-id') ?? '';
  const secret = request.headers.get('x-s2s-client-secret') ?? '';
  const upstream = `${process.env.BONUS_API_URL}/api/v1/bonus/user-bonuses/${encodeURIComponent(user_id)}/transactions/${encodeURIComponent(txn_id)}`;
  const upstreamHeaders = buildS2SHeaders(clientId, secret, 'GET', '', null);
  const res = await fetch(upstream, { method: 'GET', headers: upstreamHeaders });
  const data: unknown = await res.json();
  logApiCall({
    ts: new Date().toISOString(),
    route: `/api/transactions/${user_id}/${txn_id}`,
    method: 'GET',
    client_id: clientId,
    upstream,
    request_headers: sanitizeHeaders(request.headers),
    upstream_headers: upstreamHeaders,
    request_body: null,
    response_status: res.status,
    response_body: data,
  });
  return NextResponse.json(data, { status: res.status });
}
