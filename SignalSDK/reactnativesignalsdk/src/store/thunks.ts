import { createAsyncThunk } from '@reduxjs/toolkit';
import { buildEvent, trackEvent } from '../services/EventService';
import { identifyPlayer } from '../services/IdentityService';
import { SDKResponse, IdentityPayload, IdentifyRequest } from '../types';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { sdkActions } from './sdkSlice';
import { RootState } from './index';
import { logger } from '../utils/logger';

export const sendEventThunk = createAsyncThunk<
  SDKResponse,
  { eventName: string; properties?: Record<string, unknown> },
  { state: RootState; rejectValue: string }
>('wynta/sendEvent', async ({ eventName, properties = {} }, { getState, rejectWithValue }) => {
  const { clientId, clientSecret, baseUrl, userId } = getState().sdk;

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

    return { success: true };
  } catch (err: unknown) {
    const error = err as Error;
    return rejectWithValue(error.name === 'AbortError' ? 'Request timed out.' : (error.message ?? 'Unknown error'));
  }
});
