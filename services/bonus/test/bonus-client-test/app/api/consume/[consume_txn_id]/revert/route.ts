import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { buildS2SHeaders } from '@/lib/s2s';

export const runtime = 'nodejs';

type Params = Promise<{ consume_txn_id: string }>;

export async function POST(
  request: NextRequest,
  { params }: { params: Params },
): Promise<NextResponse> {
  const { consume_txn_id } = await params;
  const clientId = request.headers.get('x-s2s-client-id') ?? '';
  const secret = request.headers.get('x-s2s-client-secret') ?? '';
  const bodyJson = await request.text();
  const upstream = `${process.env.BONUS_API_URL}/api/v1/user-bonuses/consume/${consume_txn_id}/revert`;
  const res = await fetch(upstream, {
    method: 'POST',
    headers: buildS2SHeaders(clientId, secret, 'POST', '', bodyJson),
    body: bodyJson,
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
