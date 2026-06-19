import { NextResponse } from 'next/server';
import { buildS2SHeaders } from '@/lib/s2s';

export async function POST(request, { params }) {
  const { consume_txn_id } = await params;
  const upstream = `${process.env.BONUS_API_URL}/api/v1/user-bonuses/consume/${consume_txn_id}/revert`;

  const res = await fetch(upstream, {
    method: 'POST',
    headers: buildS2SHeaders('POST', '', ''),
    body: '',
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
