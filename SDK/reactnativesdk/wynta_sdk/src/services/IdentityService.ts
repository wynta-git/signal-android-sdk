import { IdentifyRequest, IdentifyResponse } from '../types';

const IDENTIFY_URL = 'https://qa-app.fozilpartners.com/api/v1/events/identify';
const TIMEOUT_MS = 10_000;

export async function identifyPlayer(
  payload: IdentifyRequest,
  clientId: string,
  clientSecret: string,
): Promise<IdentifyResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const requestBody = JSON.stringify(payload);

  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Id': clientId,
    'X-Client-Secret': clientSecret,
  };

  console.log(
    '\n[WyntaSDK] ══ setIdentity REQUEST ══\n' +
    'URL    : POST ' + IDENTIFY_URL + '\n' +
    'Headers: ' + JSON.stringify(headers) + '\n' +
    'Body   : ' + requestBody
  );

  try {
    const response = await fetch(IDENTIFY_URL, {
      method: 'POST',
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    const responseText = await response.text();

    console.log(
      '\n[WyntaSDK] ══ setIdentity RESPONSE ══\n' +
      'Status : ' + response.status + ' ' + response.statusText + '\n' +
      'Body   : ' + responseText
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${responseText}`);
    }

    return { success: true };
  } finally {
    clearTimeout(timer);
  }
}
