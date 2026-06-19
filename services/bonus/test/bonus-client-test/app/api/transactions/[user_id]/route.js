import { NextResponse } from 'next/server';
import { buildS2SHeaders } from '@/lib/s2s';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const clientId = request.headers.get('x-s2s-client-id');
  const secret   = request.headers.get('x-s2s-client-secret');
  const { user_id } = await params;
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const upstream = `${process.env.BONUS_API_URL}/api/v1/user-bonuses/${user_id}/transactions${qs ? `?${qs}` : ''}`;

  const res = await fetch(upstream, {
    method: 'GET',
    headers: buildS2SHeaders(clientId, secret, 'GET', qs, null),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
