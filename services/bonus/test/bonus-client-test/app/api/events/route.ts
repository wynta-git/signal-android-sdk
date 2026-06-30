import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { logApiCall, sanitizeHeaders } from "@/lib/logger";

export const runtime = "nodejs";

interface EventBody {
  user_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_id: string;
  event_name?: string;
  promo_code?: string;
}

function buildProperties(body: EventBody): Record<string, unknown> {
  const eventName = (body.event_name ?? "deposit_success").toUpperCase();

  if (eventName === "BET_PLACED") {
    return {
      transaction_amount: body.amount.toFixed(4),
      bonus_amount: "0.0000",
      chip_type: "CASH",
      wager_tnx_id: body.transaction_id,
      session_key: `sess_${Date.now()}`,
      platform_client_id: "bonus-client-test",
      product: "RUMMY",
      game_type: "TOURNEY",
      game_variant: "holdem",
      game_name: "Friday Holdem",
      game_action: "REGISTER_TOURNY",
      primary_transaction_id: 1,
      secondary_transaction_id: 2,
      tertiary_transaction_id: 3,
      base_request_id: 3,
    };
  }

  return {
    transaction_id: body.transaction_id,
    amount: body.amount,
    currency: body.currency,
    payment_method: body.payment_method || null,
    ...(body.promo_code ? { promo_code: body.promo_code } : {}),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientId = request.headers.get("x-s2s-client-id") ?? "";
  const secret = request.headers.get("x-s2s-client-secret") ?? "";
  const body = (await request.json()) as EventBody;

  const event = {
    event_id: randomUUID(),
    event_name: body.event_name ?? "deposit_success",
    schema_version: 1,
    user_id: body.user_id,
    session_id: `sess_${Date.now()}`,
    timestamp: new Date().toISOString(),
    sdk: { name: "bonus-client-test", version: "1.0.0" },
    device: { platform: "web", os: "simulator", ua: "bonus-client-test/1.0" },
    properties: buildProperties(body),
  };

  const upstream = `${process.env.API_SERVICE_URL}/api/v1/events/track`;
  const upstreamHeaders = {
    "Content-Type": "application/json",
    "X-Client-Id": clientId,
    "X-Client-Secret": "[REDACTED]",
  };
  const res = await fetch(upstream, {
    method: "POST",
    headers: { ...upstreamHeaders, "X-Client-Secret": secret },
    body: JSON.stringify({ events: [event] }),
  });

  const data: unknown = await res.json();
  logApiCall({
    ts: new Date().toISOString(),
    route: '/api/events',
    method: 'POST',
    client_id: clientId,
    upstream,
    request_headers: sanitizeHeaders(request.headers),
    upstream_headers: upstreamHeaders,
    request_body: event,
    response_status: res.status,
    response_body: data,
  });
  return NextResponse.json(data, { status: res.status });
}
