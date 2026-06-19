import { NextResponse } from 'next/server';
import { buildS2SHeaders } from '@/lib/s2s';

export async function POST(request) {
  const clientId = request.headers.get('x-s2s-client-id');
  const secret   = request.headers.get('x-s2s-client-secret');
  const body     = await request.json();
  const bodyStr  = JSON.stringify(body);
  const upstream = `${process.env.BONUS_API_URL}/api/v1/user-bonuses/consume`;

  const res = await fetch(upstream, {
    method: 'POST',
    headers: buildS2SHeaders(clientId, secret, 'POST', '', bodyStr),
    body: bodyStr,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
