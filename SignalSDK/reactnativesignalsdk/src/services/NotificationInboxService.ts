import { InboxResponse } from '../types';
import { fireApiLog } from '../utils/apiLogger';

const TIMEOUT_MS = 10_000;

export async function fetchInbox(
  userId: string,
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<InboxResponse> {
  //const INBOX_URL = `${baseUrl}/events/notifications/inbox?user_id=${encodeURIComponent(userId)}&unread_only=true`;
  const INBOX_URL = `${baseUrl}/events/notifications/inbox?user_id=${encodeURIComponent(userId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Id': clientId,
    'X-Client-Secret': clientSecret,
  };

  try {
    const response = await fetch(INBOX_URL, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    const responseText = await response.text();

    fireApiLog({
      url: INBOX_URL,
      method: 'GET',
      requestHeaders: headers,
      requestBody: '',
      responseStatus: response.status,
      responseBody: responseText,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${responseText}`);
    }

    return JSON.parse(responseText) as InboxResponse;
  } finally {
    clearTimeout(timer);
  }
}

export async function markNotificationsRead(
  notificationIds: string[],
  userId: string,
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<void> {
  const READ_URL = `${baseUrl}/events/notifications/read?user_id=${encodeURIComponent(userId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const requestBody = JSON.stringify({ notification_ids: notificationIds });
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Id': clientId,
    'X-Client-Secret': clientSecret,
  };

  try {
    const response = await fetch(READ_URL, {
      method: 'POST',
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    const responseText = await response.text();

    fireApiLog({
      url: READ_URL,
      method: 'POST',
      requestHeaders: headers,
      requestBody,
      responseStatus: response.status,
      responseBody: responseText,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${responseText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
