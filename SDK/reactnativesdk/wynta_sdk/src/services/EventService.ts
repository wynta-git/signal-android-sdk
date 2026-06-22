import { generateUUID } from '../utils/uuid';
import { getSessionId } from './SessionService';
import { getDeviceInfo } from './DeviceService';
import { TrackEvent, APIResponse } from '../types';

const SDK_INFO = { name: 'pam-web', version: '1.0.0' };
const API_URL = 'https://qa-app.fozilpartners.com/api/v1/events/track';
const TIMEOUT_MS = 10_000;

export function buildEvent(
  eventName: string,
  properties: Record<string, unknown>,
  userId: string,
): TrackEvent {
  return {
    event_id: generateUUID(),
    event_name: eventName,
    schema_version: 1,
    user_id: userId,
    session_id: getSessionId(),
    timestamp: new Date().toISOString(),
    sdk: SDK_INFO,
    device: getDeviceInfo(),
    properties,
  };
}

export async function trackEvent(
  event: TrackEvent,
  clientId: string,
  clientSecret: string,
): Promise<APIResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const requestBody = JSON.stringify({ events: [event] });

  console.log('[WyntaSDK] trackEvent → URL:', API_URL);
  console.log('[WyntaSDK] trackEvent → Headers:', {
    'Content-Type': 'application/json',
    'X-Client-Id': clientId,
    'X-Client-Secret': clientSecret,
  });
  console.log('[WyntaSDK] trackEvent → Body:', requestBody);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId,
        'X-Client-Secret': clientSecret,
      },
      body: requestBody,
      signal: controller.signal,
    });

    console.log('[WyntaSDK] trackEvent → HTTP status:', response.status, response.statusText);

    const responseText = await response.text();
    console.log('[WyntaSDK] trackEvent → Raw response:', responseText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${responseText}`);
    }

    return JSON.parse(responseText) as APIResponse;
  } finally {
    clearTimeout(timer);
  }
}
