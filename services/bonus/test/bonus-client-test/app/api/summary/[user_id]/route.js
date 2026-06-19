import { NextResponse } from 'next/server';
import { buildS2SHeaders } from '@/lib/s2s';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const clientId = request.headers.get('x-s2s-client-id');
  const secret   = request.headers.get('x-s2s-client-secret');
  const { user_id } = await params;
  const upstream = `${process.env.BONUS_API_URL}/api/v1/user-bonuses/${user_id}/summary`;

  const res = await fetch(upstream, {
    method: 'GET',
    headers: buildS2SHeaders(clientId, secret, 'GET', '', null),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
