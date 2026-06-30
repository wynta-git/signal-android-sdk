import { generateUUID } from '../utils/uuid';
import { getSessionId } from './SessionService';
import { getDeviceInfo } from './DeviceService';
import { TrackEvent, APIResponse } from '../types';
import { fireApiLog } from '../utils/apiLogger';

const SDK_INFO = { name: 'pam-web', version: '1.0.0' };
const TIMEOUT_MS = 10_000;

// Fields that already exist at the top level of every event object.
// Silently drop them if the caller accidentally includes them in properties.
const RESERVED_KEYS = new Set([
  'user_id', 'session_id', 'event_id', 'event_name',
  'timestamp', 'schema_version', 'sdk', 'device',
]);

export function buildEvent(
  eventName: string,
  properties: Record<string, unknown>,
  userId: string,
): TrackEvent {
  const sanitizedProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!RESERVED_KEYS.has(key)) {
      sanitizedProperties[key] = value;
    }
  }

  return {
    event_id: generateUUID(),
    event_name: eventName,
    schema_version: 1,
    user_id: userId,
    session_id: getSessionId(),
    timestamp: new Date().toISOString(),
    sdk: SDK_INFO,
    device: getDeviceInfo(),
    properties: sanitizedProperties,
  };
}

export async function trackEvent(
  event: TrackEvent,
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<APIResponse> {
  const API_URL = `${baseUrl}/events/track`;
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

    fireApiLog({
      url: API_URL,
      method: 'POST',
      requestHeaders: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId,
        'X-Client-Secret': clientSecret,
      },
      requestBody,
      responseStatus: response.status,
      responseBody: responseText,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${responseText}`);
    }

    return JSON.parse(responseText) as APIResponse;
  } finally {
    clearTimeout(timer);
  }
}
