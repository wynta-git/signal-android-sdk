import { IdentifyRequest, IdentifyResponse } from '../types';

const IDENTIFY_URL = 'https://qa-app.fozilpartners.com/api/v1/events/identify';
const TIMEOUT_MS = 10_000;

export async function identifyPlayer(
  payload: IdentifyRequest,
  bearerToken: string,
): Promise<IdentifyResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const requestBody = JSON.stringify(payload);

  console.log('[WyntaSDK] identifyPlayer → URL:', IDENTIFY_URL);
  console.log('[WyntaSDK] identifyPlayer → Headers:', {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearerToken}`,
  });
  console.log('[WyntaSDK] identifyPlayer → Body:', requestBody);

  try {
    const response = await fetch(IDENTIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: requestBody,
      signal: controller.signal,
    });

    console.log('[WyntaSDK] identifyPlayer → HTTP status:', response.status, response.statusText);

    const responseText = await response.text();
    console.log('[WyntaSDK] identifyPlayer → Raw response:', responseText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${responseText}`);
    }

    return { success: true };
  } finally {
    clearTimeout(timer);
  }
}
