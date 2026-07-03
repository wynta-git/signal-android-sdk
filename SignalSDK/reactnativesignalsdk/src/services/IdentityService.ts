import { IdentifyRequest, IdentifyResponse } from '../types';
import { fireApiLog } from '../utils/apiLogger';

const TIMEOUT_MS = 10_000;

export async function identifyPlayer(
  payload: IdentifyRequest,
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<IdentifyResponse> {
  const IDENTIFY_URL = `${baseUrl}/events/identify`;
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

    fireApiLog({
      url: IDENTIFY_URL,
      method: 'POST',
      requestHeaders: headers,
      requestBody,
      responseStatus: response.status,
      responseBody: responseText,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${responseText}`);
    }

    return { success: true };
  } finally {
    clearTimeout(timer);
  }
}
