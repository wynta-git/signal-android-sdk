import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

interface EventBody {
  user_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_id: string;
  event_name?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientId = request.headers.get('x-s2s-client-id') ?? '';
  const secret   = request.headers.get('x-s2s-client-secret') ?? '';
  const body = (await request.json()) as EventBody;

  const event = {
    event_id: randomUUID(),
    event_name: body.event_name ?? 'deposit_success',
    schema_version: 1,
    user_id: body.user_id,
    session_id: `sess_${Date.now()}`,
    timestamp: new Date().toISOString(),
    sdk: { name: 'bonus-client-test', version: '1.0.0' },
    device: { platform: 'web', os: 'simulator', ua: 'bonus-client-test/1.0' },
    properties: {
      transaction_id: body.transaction_id,
      amount: body.amount,
      currency: body.currency,
      payment_method: body.payment_method || null,
    },
  };

  const upstream = `${process.env.API_SERVICE_URL}/api/v1/events/track`;
  const res = await fetch(upstream, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': clientId,
      'X-Client-Secret': secret,
    },
    body: JSON.stringify({ events: [event] }),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
