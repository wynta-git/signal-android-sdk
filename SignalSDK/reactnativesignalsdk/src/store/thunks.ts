import { createAsyncThunk, ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';
import { NativeModules } from 'react-native';
import { buildEvent, trackEvent } from '../services/EventService';
import { identifyPlayer } from '../services/IdentityService';
import { fetchInbox } from '../services/NotificationInboxService';
import { findEligibleNotification } from '../services/TriggerEngine';
import { SDKResponse, IdentityPayload, IdentifyRequest, InboxNotification } from '../types';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { sdkActions } from './sdkSlice';
import { RootState } from './index';
import { logger } from '../utils/logger';

const { WyntaSDKModule } = NativeModules;

type ThunkAPIDispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

// Shared by the session-start path (checkInboxThunk) and the screen-load path
// (trackScreenThunk) — marks the notification handled, guards further popups
// until this one is dismissed, and hands off to the native renderer.
function displayNotification(notification: InboxNotification, dispatch: ThunkAPIDispatch): void {
  dispatch(sdkActions.markInAppNotificationHandled(notification.notification_id));
  dispatch(sdkActions.setInAppPopupVisible(true));

  const cta = notification.cta?.[0];

  WyntaSDKModule?.showInAppPopup(
    notification.notification_id,
    notification.campaign_id,
    notification.media!.image_url,
    cta?.label ?? null,
    cta?.action ?? 'dismiss',
    cta?.value ?? null,
  );
}

export const sendEventThunk = createAsyncThunk<
  SDKResponse,
  { eventName: string; properties?: Record<string, unknown> },
  { state: RootState; rejectValue: string }
>('wynta/sendEvent', async ({ eventName, properties = {} }, { getState, dispatch, rejectWithValue }) => {
  const { clientId, clientSecret, baseUrl, userId, notificationCache, handledInAppNotificationIds, isInAppPopupVisible } = getState().sdk;

  // on_custom_event evaluation — purely local, no network dependency, so it runs
  // regardless of whether the /events/track call below succeeds.
  if (!isInAppPopupVisible) {
    const notification = findEligibleNotification(
      notificationCache,
      { type: 'custom_event', eventName },
      handledInAppNotificationIds,
    );
    logger.log(
      `[WyntaSDK] on_custom_event check for '${eventName}' — cache=${notificationCache.length} ` +
      `candidates=${notificationCache.filter((n) => n.trigger_type === 'on_custom_event').length} ` +
      `match=${notification ? notification.notification_id : 'none'}`,
    );
    if (notification) displayNotification(notification, dispatch);
  }

  try {
    const event = buildEvent(eventName, properties, userId!);
    logger.log(`Sending event: ${eventName}`, event);
    logger.log('API Request Headers:', {
      'Content-Type': 'application/json',
      'X-Client-Id': clientId,
      'X-Client-Secret': clientSecret,
    });
    const apiResponse = await trackEvent(event, clientId!, clientSecret!, baseUrl);
    logger.log('Event response:', apiResponse);
    return { success: true, accepted: apiResponse.accepted, rejected: apiResponse.rejected };
  } catch (err: unknown) {
    const error = err as Error;
    return rejectWithValue(error.name === 'AbortError' ? 'Request timed out.' : (error.message ?? 'Unknown error'));
  }
});

export const setIdentityThunk = createAsyncThunk<
  SDKResponse,
  IdentityPayload,
  { state: RootState; rejectValue: string }
>('wynta/setIdentity', async (payload, { getState, dispatch, rejectWithValue }) => {
  const current = getState().sdk;

  // Merge incoming payload with stored state — omitted fields keep current values
  const userId = payload.user_id ?? current.userId;
  const fcmToken = payload.fcm_token ?? current.fcmToken;

  if (!userId) {
    return rejectWithValue('user_id is required. Provide it in the payload or call setIdentity with a user_id first.');
  }

  // Update store synchronously
  dispatch(sdkActions.setIdentityData({
    ...(payload.user_id !== undefined && { userId: payload.user_id }),
    ...(payload.fcm_token !== undefined && { fcmToken: payload.fcm_token }),
  }));

  // Persist FCM token whenever it changes
  if (payload.fcm_token && payload.fcm_token !== current.fcmToken) {
    await storage.set(STORAGE_KEYS.FCM_TOKEN, payload.fcm_token);
    logger.log(`FCM token persisted`);
  }

  // Merge fcm_token into traits so it reaches the backend
  const mergedTraits = {
    ...payload.traits,
    ...(fcmToken && { fcm_token: fcmToken }),
  };

  const identifyPayload: IdentifyRequest = {
    user_id: userId,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    ...(Object.keys(mergedTraits).length > 0 && { traits: mergedTraits }),
    ...(payload.anonymous_id && { anonymous_id: payload.anonymous_id }),
    ...(payload.unset_traits?.length && { unset_traits: payload.unset_traits }),
  };

  logger.log(`setIdentity → user: ${userId}`, identifyPayload);

  try {
    await identifyPlayer(identifyPayload, current.clientId!, current.clientSecret!, current.baseUrl);
    logger.log('setIdentity response: success');

    // Auto-track sdk_init + session_started + app_opened on the first setIdentity call after each initSDK
    if (!current.appOpenTracked) {
      dispatch(sdkActions.setAppOpenTracked());
      const clientId = current.clientId!;
      const clientSecret = current.clientSecret!;
      const baseUrl = current.baseUrl;
      trackEvent(buildEvent('sdk_init', {}, userId), clientId, clientSecret, baseUrl).catch((err) => {
        logger.log(`[WyntaSDK] sdk_init auto-track failed: ${err}`);
      });
      trackEvent(buildEvent('session_started', {}, userId), clientId, clientSecret, baseUrl).catch((err) => {
        logger.log(`[WyntaSDK] session_started auto-track failed: ${err}`);
      });
      trackEvent(buildEvent('app_opened', {}, userId), clientId, clientSecret, baseUrl).catch((err) => {
        logger.log(`[WyntaSDK] app_opened auto-track failed: ${err}`);
      });
    }

    // Inbox is per-user — refetch whenever the identified user actually changes (this
    // covers both the cold-start case, where current.userId is null, and a later login
    // that switches from an anonymous id to a real user id). app_foreground never fires
    // on a fresh launch, so the cold-start case isn't otherwise covered.
    if (userId !== current.userId) {
      dispatch(checkInboxThunk());
    }

    return { success: true };
  } catch (err: unknown) {
    const error = err as Error;
    return rejectWithValue(error.name === 'AbortError' ? 'Request timed out.' : (error.message ?? 'Unknown error'));
  }
});

export const checkInboxThunk = createAsyncThunk<
  void,
  void,
  { state: RootState }
>('wynta/checkInbox', async (_arg, { getState, dispatch }) => {
  const { initialized, userId, clientId, clientSecret, baseUrl, handledInAppNotificationIds, isInAppPopupVisible } = getState().sdk;

  if (!initialized || !userId || !clientId || !clientSecret) {
    logger.log('[WyntaSDK] checkInbox skipped — no active identity');
    return;
  }

  try {
    const inbox = await fetchInbox(userId, clientId, clientSecret, baseUrl);
    logger.log(`[WyntaSDK] checkInbox → ${inbox.notifications.length} notification(s)`);

    // Cache the full response so trackScreen() can evaluate on_screen_load triggers
    // locally later, with no extra network call.
    dispatch(sdkActions.setNotificationCache(inbox.notifications));

    if (isInAppPopupVisible) return; // don't stack a popup on top of one already shown

    // Rendering happens entirely natively (a transparent overlay Activity on Android, an
    // overlay UIWindow on iOS) — no JS component to mount, no host app changes required.
    // The native side calls back via the 'wynta_inapp_interaction' event (see WyntaSDK.ts)
    // for the viewed/clicked/dismissed tracking calls.
    const notification = findEligibleNotification(
      inbox.notifications,
      { type: 'session_start' },
      handledInAppNotificationIds,
    );
    if (notification) displayNotification(notification, dispatch);
  } catch (err: unknown) {
    const error = err as Error;
    logger.log(`[WyntaSDK] checkInbox failed: ${error.message ?? error}`);
  }
});

export const trackScreenThunk = createAsyncThunk<
  void,
  string,
  { state: RootState }
>('wynta/trackScreen', async (screenName, { getState, dispatch }) => {
  const {
    initialized, userId, clientId, clientSecret, baseUrl,
    notificationCache, handledInAppNotificationIds, isInAppPopupVisible, currentScreen,
  } = getState().sdk;

  if (!initialized) {
    logger.log('[WyntaSDK] trackScreen skipped — SDK not initialized');
    return;
  }

  const referrer = currentScreen ?? null;
  dispatch(sdkActions.setCurrentScreen(screenName));

  // Fire-and-forget analytics — same direct pattern as the sdk_init/session_started/
  // app_opened auto-tracked events in setIdentityThunk.
  if (userId && clientId && clientSecret) {
    trackEvent(
      buildEvent('screen_viewed', { screen_name: screenName, referrer }, userId),
      clientId, clientSecret, baseUrl,
    ).catch((err) => logger.log(`[WyntaSDK] screen_viewed failed: ${err}`));
  }

  if (isInAppPopupVisible) return; // don't stack a popup on rapid navigation

  const notification = findEligibleNotification(
    notificationCache,
    { type: 'screen_load', screenName },
    handledInAppNotificationIds,
  );
  if (notification) displayNotification(notification, dispatch);
});
